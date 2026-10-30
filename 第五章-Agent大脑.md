# 第五章 Agent 大脑：让模型学会调用工具

## 本章导读

前四章做的都是「人填表，程序存」。本章是整本书的核心：让用户说一句「午饭花了 25 块」，模型自己判断该调用哪个工具、填什么参数，程序执行后它再把结果讲给用户听。你会亲手写出那个著名的「Agent 循环」——不到 60 行。

**学习目标**

- 会为函数编写工具描述（JSON Schema），理解描述质量如何影响调用准确率
- 能完整讲清 `tool_calls → 执行 → tool 消息回填 → 再推理` 的往返
- 掌握提示词里该写什么：日期、枚举、边界规则
- 会调试三类常见问题：不调工具、参数解析失败、循环不收敛

## 5.1 接入 DeepSeek

**第一步：拿 Key。** 打开 https://platform.deepseek.com 注册登录，在「API Keys」里创建一个，形如 `sk-xxxx`。充一点点钱即可，记账问答一次的成本以「厘」计。

**第二步：写进配置。** 打开 `ai-ledger/.env`：

```
DEEPSEEK_API_KEY=sk-你的key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

`.env` 不进版本库（别把 Key 提交到 GitHub，泄露后立刻去控制台作废重发）。

**第三步：为什么用 `openai` 这个库？** DeepSeek 的接口与 OpenAI 完全兼容：同样的路径、同样的消息格式、同样的 `tools` 参数。所以用官方 `openai` SDK，只需把 `base_url` 指过去：

```python
def _client():
    key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not key:
        return None
    return OpenAI(api_key=key, base_url=BASE_URL)
```

Key 为空时返回 `None`，`chat()` 里会回一条「还没配置 Key」的友好提示——**缺配置不应该让整个应用崩溃**。

## 5.2 工具清单：告诉模型它有什么手

`TOOLS` 是一个列表，每一项描述一个可调用的函数。以 `add_expense` 为例：

```python
{
    "type": "function",
    "function": {
        "name": "add_expense",
        "description": "记录一笔支出",
        "parameters": {
            "type": "object",
            "properties": {
                "amount":   {"type": "number", "description": "金额（元）"},
                "category": {"type": "string", "enum": ["餐饮", "交通", "购物", ...]},
                "note":     {"type": "string", "description": "备注，例如：公司楼下的牛肉面"},
                "date":     {"type": "string", "description": "日期 YYYY-MM-DD，默认今天"}
            },
            "required": ["amount", "category"]
        }
    }
}
```

这段 Schema 就是模型眼中的「说明书」，三个细节决定成败：

1. **`description` 是写给模型看的**，要像对实习生交代一样具体。`"备注，例如：公司楼下的牛肉面"` 比 `"备注"` 能让模型填出更有用的内容。
2. **`enum` 锁死分类**。如果只写 `"type": "string"`，模型可能填出「吃饭」「food」这类值，统计就乱了。枚举让非法值在源头就不会出现。
3. **`required` 只列真正必需的**。`note` 和 `date` 可以让模型按需省略，我们的 `_run_tool` 会给默认值。

项目里一共四个工具：`add_expense`、`list_expenses`、`get_summary`、`delete_expense`——记账、查账、统计、删除，正好覆盖账本的全部操作。

## 5.3 核心循环

`agent.py` 的 `chat()` 就是全书的心脏，完整读一遍：

```python
def chat(history):
    client = _client()
    if client is None:
        return ("还没有配置 DeepSeek API Key……", [])

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-12:])
    actions = []

    for _ in range(5):
        resp = client.chat.completions.create(
            model=MODEL, messages=messages, tools=TOOLS, temperature=0.3
        )
        msg = resp.choices[0].message

        if not msg.tool_calls:
            return (msg.content or "", actions)

        messages.append({                       # ① 模型的「调用意图」入历史
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name,
                              "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })

        for tc in msg.tool_calls:               # ② 逐个执行
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            result = _run_tool(tc.function.name, args)
            actions.append({"tool": tc.function.name, "args": args, "result": result})
            messages.append({                   # ③ 执行结果回填
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

    return ("处理步骤有点多，先停一下。换个问法再试试？", actions)
```

分段解释：

**准备消息**：系统提示（人设与规则）+ 最近 12 条对话历史。为什么截断到 12 条？模型有上下文长度上限，聊天太长时必须取舍；记账场景下更早的历史很少有用。

**循环与出口**：`for _ in range(5)` 最多五个来回。如果没有工具调用（`msg.tool_calls` 为空），说明模型认为可以回答了，直接返回内容并结束。上限的作用是**防止模型陷入无限调用**——真实项目里这是必须的保险丝。

**① 意图入历史**：模型返回的 `tool_calls` 必须原样追加到消息历史里，否则下一轮模型会「忘记自己刚才要调用什么」，接口也会因为缺少对应的 assistant 消息而报错。

**② 执行**：`arguments` 是模型生成的 **JSON 字符串**，要 `json.loads` 成字典。注意 `try/except`——模型偶尔会输出坏 JSON，容错成空字典后，`_run_tool` 里的 `.get()` 默认值会让程序继续跑，而不是 500 崩掉。

**③ 结果回填**：每条工具结果都作为 `role: "tool"` 的消息追加，并且必须带上 `tool_call_id`——这是它和前面那条调用意图的对应关系。模型看到结果后，下一轮就能据此组织自然语言。

## 5.4 执行工具：白名单

```python
def _run_tool(name, args):
    if name == "add_expense":
        return db.add_expense(args.get("amount"), args.get("category", "其他"),
                              args.get("note", ""), args.get("date"))
    if name == "list_expenses":
        return db.list_expenses(args.get("month"), args.get("category"),
                                args.get("limit") or 20)
    ...
    return {"error": "未知工具: " + name}
```

模型说调用什么就调用什么？**不。** 这里是一串 `if`，等价于白名单：只有清单里的工具会被执行，其余一律返回错误。这正是第一章说的——执行权在程序手里。生产环境还应在这里加参数校验、权限判断、操作审计。

## 5.5 提示词：规则要写在系统消息里

```python
SYSTEM_PROMPT = f"""你是「小账本」的 AI 记账助手，今天日期是 {date.today().isoformat()}。
...
2. 用户问花了多少、要看明细或统计时，先调用工具获取真实数据，再基于数据回答，绝不编造数字。
3. 用户要删除某笔记录时，先 list_expenses 找到它，再 delete_expense。
4. 回答用简体中文，简短友好...
"""
```

每条规则都对应一个真实踩过的坑：

- **日期注入**：模型不知道「今天」是哪天，`{date.today()}` 写进提示词，「昨天打车 18 块」才能算对日期；
- **绝不编造数字**：不强调的话，模型倾向于「猜」一个统计结果——必须强制它先调工具；
- **删除两步走**：直接让模型删很容易删错，先列出候选、确认 id 再删更稳；
- **简短友好**：模型默认话痨，风格要求得明说。

## 5.6 完整的一次往返

以「午饭花了 25 块」为例，`messages` 的演变：

```
[system] 你是「小账本」的 AI 记账助手…
[user]   午饭花了 25 块
[assistant(tool_calls)] add_expense({"amount": 25, "category": "餐饮", "note": "午饭"})
[tool]   {"id": 1, "amount": 25.0, "category": "餐饮", ...}
[assistant] 好的，记下了：餐饮 25 元（牛肉面……）
```

第二轮请求把前四行一起发给模型，模型读到 tool 结果，生成第五行——这就是「多轮」的全部真相：**每次都是完整的上下文重发**。

## 5.7 调试技巧

- **打印 messages**：在 `create()` 前 `print(messages)`，能看到模型每轮到底收到了什么；
- **日志看 uvicorn 输出**：接口报错会出现在启动服务的终端里；
- **常见故障对照表**：

| 现象 | 多半原因 |
| --- | --- |
| 回复「还没有配置 API Key」 | `.env` 没填 / 填了没重启 |
| 401 / 402 错误 | Key 无效 / 余额不足 |
| 模型只聊天不记账 | 提示词太弱，或工具 description 不清晰 |
| 参数 JSON 解析失败 | 模型输出坏 JSON，检查容错分支是否生效 |
| 回复「处理步骤有点多」 | 五轮的保险丝被触发，多半是工具返回了让模型困惑的结果 |

## 本章小结

- Agent 循环 = 系统提示 + 历史消息 → 模型 → 若 `tool_calls` 则执行并回填 → 再请求，直到无工具调用。
- 工具描述是写给模型的说明书：description 要具体、枚举要收紧、required 只列必需的。
- 执行权永远在本地白名单里；循环必须有次数上限。
- 提示词里的日期、防编造、两步删除，都是从实际错误里长出来的规则。

## 练习

1. 新加一个工具 `search_expenses(keyword)`：按备注关键字搜索，让模型能回答「我上次吃面是什么时候」。
2. 把 `temperature` 从 0.3 改成 1.2 连续记账十次，观察分类填得是否还稳定，再改回来——体会温度对工具调用稳定性的影响。
3. 在 `SYSTEM_PROMPT` 里加一条「单笔超过 500 元时提醒用户确认」，测试模型是否会遵守。
