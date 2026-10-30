# 第四章 API 层：FastAPI 接口设计

## 本章导读

数据层已经能存能查了，但它只是 Python 函数——浏览器没法直接调用。本章用 FastAPI 把 `db.py` 的能力包装成 HTTP 接口，并亲手用 curl 把每个接口测一遍。做完之后，你的项目就已经是一个「没有界面的完整后端」了。

**学习目标**

- 会设计一组 REST 风格的接口路径
- 理解 Pydantic 模型如何做请求校验
- 会用 curl 测试 GET/POST/DELETE，并读懂错误响应

## 4.1 接口怎么划

先想清楚「资源」和「动作」：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/expenses` | 查明细（可按 month/category 过滤） |
| POST | `/api/expenses` | 新增一笔 |
| DELETE | `/api/expenses/{id}` | 删除指定记录 |
| GET | `/api/summary` | 本月统计 |
| POST | `/api/chat` | 与 Agent 对话 |

规律很朴素：**对同一种资源用同一路径，用 HTTP 方法表达动作**；路径里的 `{id}` 是路径参数。`/api` 前缀把数据接口和前端静态文件区分开。

## 4.2 app.py 的骨架

```python
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

import agent
import db

db.init()
app = FastAPI(title="小账本 · AI 记账助手")
```

两个细节：

- **`.env` 在导入 agent 之前加载**：`agent.py` 顶层会读取 `DEEPSEEK_API_KEY` 环境变量，必须先注水再使用。
- **`db.init()` 放在模块级**：服务一启动就建表，保证后面的请求一定有表可用。

## 4.3 请求体校验：Pydantic 模型

```python
class ExpenseIn(BaseModel):
    amount: float
    category: str
    note: str = ""
    date: Optional[str] = None
```

FastAPI 会拿这个模型去校验请求 JSON：

- 缺 `amount` → 自动返回 422，并告诉你缺哪个字段；
- `amount` 传了 `"abc"` → 422，类型不对；
- `note` 不传 → 用默认值 `""`。

**能交给框架的就交给框架**，业务校验（比如金额必须大于 0）才写在路由里：

```python
@app.post("/api/expenses")
def create_expense(item: ExpenseIn):
    if item.amount <= 0:
        raise HTTPException(status_code=400, detail="金额必须大于 0")
    return db.add_expense(item.amount, item.category, item.note, item.date)
```

`HTTPException` 是 FastAPI 的错误出口：`status_code` 决定 HTTP 状态，`detail` 会原样出现在响应 JSON 里，前端 `app.js` 就是读取 `detail` 来弹出错误信息的。

## 4.4 其余路由

```python
@app.get("/api/expenses")
def get_expenses(month: Optional[str] = None, category: Optional[str] = None, limit: int = 100):
    return db.list_expenses(month, category, limit)
```

函数参数即查询参数：`?month=2026-10&limit=20` 会被自动解析，带默认值的可选参数不传就是默认值。

```python
@app.delete("/api/expenses/{expense_id}")
def remove_expense(expense_id: int):
    if not db.delete_expense(expense_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"ok": True}
```

路径参数 `expense_id: int` 会自动转成整数；删除失败返回 404，而不是假装成功。

```python
@app.post("/api/chat")
def chat_api(body: ChatIn):
    reply, actions = agent.chat([m.model_dump() for m in body.messages])
    return {"reply": reply, "actions": actions}
```

聊天接口的入参是一个消息列表（用户和助手的历史对话），出参除了回复文本，还带 `actions`——本次触发了哪些工具。前端看到 `actions` 非空就知道账本数据变了，需要刷新。

## 4.5 托管前端：挂在最后

```python
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "static"), html=True), name="static")
```

这一行让 FastAPI 顺便当静态服务器：访问 `/` 返回 `static/index.html`，`/style.css`、`/app.js` 也能直接取到。

**顺序很重要**：`mount` 一定要写在所有 `/api` 路由之后。挂在 `/` 上的静态目录会「兜底」一切路径，如果写在前面，`/api/expenses` 也会先被它拦走。

## 4.6 用 curl 把接口测一遍

启动服务后（`sh start.sh`），另开一个终端：

```bash
# 1. 记一笔
curl -s -X POST http://127.0.0.1:8765/api/expenses \
  -H 'Content-Type: application/json' \
  -d '{"amount": 25, "category": "餐饮", "note": "牛肉面"}'

# 2. 查明细
curl -s 'http://127.0.0.1:8765/api/expenses'

# 3. 看统计
curl -s 'http://127.0.0.1:8765/api/summary'

# 4. 删除（id 换成第 1 步返回的）
curl -s -X DELETE http://127.0.0.1:8765/api/expenses/1

# 5. 故意传错参数，观察 422
curl -s -X POST http://127.0.0.1:8765/api/expenses \
  -H 'Content-Type: application/json' -d '{"category": "餐饮"}'
```

第 5 条会返回 `422 Unprocessable Entity`，响应体里明确指出 `amount` 是必填字段——这就是 Pydantic 帮你省下的校验代码。

另外推荐打开 FastAPI 自带的交互式文档：http://127.0.0.1:8765/docs 。每个接口都可以在页面上直接点「Try it out」调用，调试期特别好用。

## 本章小结

- REST 划分：同一资源同一路径，方法表达动作；路径参数用 `{id}`。
- Pydantic 负责「形状」校验，业务规则（金额 > 0）写在路由里，错误用 `HTTPException`。
- 静态托管必须 `mount` 在 API 路由之后，否则会兜底拦截接口。
- 调试三板斧：curl、`/docs` 页面、服务端日志。

## 练习

1. 给 `/api/expenses` 加排序参数 `order`（`asc`/`desc`），用 curl 验证。
2. 实现 `GET /api/expenses/{expense_id}` 返回单条记录，不存在时返回 404。
3. 故意把 `app.mount(...)` 挪到路由定义之前，启动后访问 `/api/summary`，观察发生了什么——亲手体验一次「挂载顺序」的坑。
