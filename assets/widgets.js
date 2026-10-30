/* 互动教学组件：Agent 循环演示 / 架构探索 / 工具卡片 */
(function () {
  'use strict';

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ============ 1. Agent 循环演示 ============ */
  var LOOP_STEPS = [
    {
      title: '把消息发给模型',
      desc: '程序把「系统提示 + 你这句话 + 四个工具的说明书」打包发给 DeepSeek。注意：模型没有记忆，每次都要重新带上完整上下文。',
      plabel: '发给模型的消息（节选）',
      payload: '{\n  "role": "system",\n  "content": "你是记账助手，今天 2026-10-30…"\n}\n{\n  "role": "user",\n  "content": "午饭花了 25 块"\n}',
      nodes: ['agent', 'llm']
    },
    {
      title: '模型决定调用工具',
      desc: '模型没有真的执行任何代码，它只返回一段结构化文本：我想调用 add_expense，参数如下。',
      plabel: '模型返回的 tool_calls',
      payload: 'add_expense({\n  "amount": 25,\n  "category": "餐饮",\n  "note": "午饭"\n})',
      nodes: ['llm']
    },
    {
      title: '你的代码执行工具',
      desc: '程序解析参数，调用本地 Python 函数，真正把数据写进 SQLite。执行权永远在你的白名单手里。',
      plabel: '本地执行',
      payload: 'db.add_expense(25, "餐饮", "午饭")\n\n账本新增一行：\n#1  餐饮  午饭   ¥25.00',
      nodes: ['agent', 'db'],
      reply: true
    },
    {
      title: '结果回填给模型',
      desc: '把执行结果作为 role=tool 的消息发回去，并带上 tool_call_id，让模型知道这是对哪一次调用的回应。',
      plabel: 'tool 消息',
      payload: '{\n  "role": "tool",\n  "tool_call_id": "call_abc123",\n  "content": "{\\"id\\":1,\\"amount\\":25.0,\\"category\\":\\"餐饮\\"}"\n}',
      nodes: ['agent', 'llm']
    },
    {
      title: '模型生成最终回复',
      desc: '模型看到「记好了」的结果，输出给用户的自然语言。没有更多工具调用，循环结束。',
      plabel: '助手回复',
      payload: '好的，记下了：餐饮 25 元 🍜\n（账本已更新，本月共 1 笔）',
      nodes: ['llm', 'user'],
      reply: true
    }
  ];

  function mountAgentLoop(host) {
    if (host.dataset.mounted) return;
    host.dataset.mounted = '1';
    host.classList.add('wgt', 'wgt-loop');

    var head = h('div', 'wgt-head');
    head.appendChild(h('div', 'wgt-title', 'Agent 循环演示'));
    head.appendChild(h('div', 'wgt-sub', '点「下一步」，看一句话如何变成账本里的一行'));
    host.appendChild(head);

    var flowDef = [
      { key: 'user', label: '你' },
      { arrow: '→' },
      { key: 'agent', label: '你的程序' },
      { arrow: '⇄' },
      { key: 'llm', label: 'DeepSeek' },
      { arrow: '→' },
      { key: 'db', label: 'SQLite' }
    ];
    var flow = h('div', 'wgt-flow');
    var nodeEls = {};
    flowDef.forEach(function (d) {
      if (d.arrow) {
        flow.appendChild(h('span', 'wgt-arrow', d.arrow));
      } else {
        var n = h('span', 'wgt-node', d.label);
        nodeEls[d.key] = n;
        flow.appendChild(n);
      }
    });
    host.appendChild(flow);

    var ol = h('ol', 'wgt-steps');
    var stepEls = LOOP_STEPS.map(function (s, i) {
      var li = h('li', 'wgt-step');
      var headRow = h('div', 'wgt-step-head');
      headRow.appendChild(h('span', 'wgt-num', String(i + 1)));
      headRow.appendChild(h('span', 'wgt-step-title', s.title));
      li.appendChild(headRow);

      var body = h('div', 'wgt-step-body');
      body.appendChild(h('p', 'wgt-desc', s.desc));
      body.appendChild(h('div', 'wgt-plabel', s.plabel));
      body.appendChild(h('pre', 'wgt-payload' + (s.reply ? ' is-reply' : ''), s.payload));
      li.appendChild(body);

      li.addEventListener('click', function () { go(i); });
      ol.appendChild(li);
      return li;
    });
    host.appendChild(ol);

    var controls = h('div', 'wgt-controls');
    var btnPrev = h('button', 'wgt-btn', '上一步');
    var btnPlay = h('button', 'wgt-btn', '播放');
    var btnNext = h('button', 'wgt-btn wgt-btn-primary', '下一步');
    var progress = h('span', 'wgt-progress', '');
    btnPrev.type = 'button';
    btnPlay.type = 'button';
    btnNext.type = 'button';
    controls.appendChild(btnPrev);
    controls.appendChild(btnPlay);
    controls.appendChild(btnNext);
    controls.appendChild(progress);
    host.appendChild(controls);

    var cur = 0;
    var timer = null;

    function render() {
      stepEls.forEach(function (li, i) {
        li.classList.toggle('is-current', i === cur);
        li.classList.toggle('is-done', i < cur);
      });
      Object.keys(nodeEls).forEach(function (k) {
        nodeEls[k].classList.toggle('is-active', LOOP_STEPS[cur].nodes.indexOf(k) > -1);
      });
      progress.textContent = (cur + 1) + ' / ' + LOOP_STEPS.length;
      btnPrev.disabled = cur === 0;
      btnNext.disabled = cur === LOOP_STEPS.length - 1;
    }

    function go(i) {
      cur = Math.max(0, Math.min(LOOP_STEPS.length - 1, i));
      render();
    }

    function stopPlay() {
      if (timer) { clearInterval(timer); timer = null; }
      btnPlay.textContent = '播放';
    }

    btnPrev.addEventListener('click', function () { stopPlay(); go(cur - 1); });
    btnNext.addEventListener('click', function () { stopPlay(); go(cur + 1); });
    btnPlay.addEventListener('click', function () {
      if (timer) { stopPlay(); return; }
      if (cur === LOOP_STEPS.length - 1) go(0);
      btnPlay.textContent = '暂停';
      timer = setInterval(function () {
        if (cur >= LOOP_STEPS.length - 1) { stopPlay(); return; }
        go(cur + 1);
      }, 2400);
    });

    render();
  }

  /* ============ 2. 架构探索器 ============ */
  var LAYERS = [
    {
      key: 'web',
      title: '前端',
      sub: 'static/',
      file: 'static/index.html · style.css · app.js',
      desc: '浏览器里看到的账本和对话框。负责展示数据、收集输入，通过 fetch 调用后端接口。',
      metaphor: '打个比方：账本的「封面和纸页」——用户直接接触的一层。',
      code: 'fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages }) })'
    },
    {
      key: 'api',
      title: '接口',
      sub: 'app.py',
      file: 'app.py（FastAPI）',
      desc: '接收 HTTP 请求、校验参数、组织响应。它不懂 AI，只负责把请求安全地转给下层。',
      metaphor: '打个比方：银行的「柜台」——受理请求、检查材料，再转给里面办事的人。',
      code: '@app.post("/api/chat")\ndef chat_api(body: ChatIn):\n    reply, actions = agent.chat(...)'
    },
    {
      key: 'agent',
      title: 'Agent',
      sub: 'agent.py + DeepSeek',
      file: 'agent.py ⇄ DeepSeek API',
      desc: '真正「动脑」的一层：和模型对话、解读 tool_calls、调用工具、回填结果。整个项目的核心。',
      metaphor: '打个比方：出纳员的「大脑」——决定这笔钱该怎么记。',
      code: 'for _ in range(5):\n    resp = client.chat.completions.create(...)\n    if not msg.tool_calls:\n        return msg.content'
    },
    {
      key: 'db',
      title: '数据',
      sub: 'db.py + SQLite',
      file: 'db.py + ledger.db（SQLite）',
      desc: '把每一笔支出落进 ledger.db 文件，提供增删改查和统计。数据层的职责是给出可直接使用的结果。',
      metaphor: '打个比方：保险柜——账本真正被保存的地方。',
      code: 'INSERT INTO expenses (amount, category, note, date)\nVALUES (?, ?, ?, ?)'
    }
  ];

  function mountArch(host) {
    if (host.dataset.mounted) return;
    host.dataset.mounted = '1';
    host.classList.add('wgt', 'wgt-arch');

    var head = h('div', 'wgt-head');
    head.appendChild(h('div', 'wgt-title', '四层架构，点开看看'));
    head.appendChild(h('div', 'wgt-sub', '鼠标点每一层，看它在项目里的文件和职责'));
    host.appendChild(head);

    var tabs = h('div', 'wgt-arch-tabs');
    var panel = h('div', 'wgt-arch-panel');
    var tabEls = {};

    function show(key) {
      var layer = LAYERS.filter(function (l) { return l.key === key; })[0];
      Object.keys(tabEls).forEach(function (k) {
        tabEls[k].classList.toggle('is-active', k === key);
      });
      panel.innerHTML = '';
      var fileBadge = h('span', 'wgt-arch-file', layer.file);
      panel.appendChild(fileBadge);
      panel.appendChild(h('p', 'wgt-arch-desc', layer.desc));
      panel.appendChild(h('p', 'wgt-arch-metaphor', layer.metaphor));
      var code = h('pre', 'wgt-arch-code', layer.code);
      panel.appendChild(code);
    }

    LAYERS.forEach(function (layer, i) {
      var btn = h('button', 'wgt-arch-tab');
      btn.type = 'button';
      btn.appendChild(document.createTextNode(layer.title));
      var small = h('small', null, layer.sub);
      btn.appendChild(small);
      btn.addEventListener('click', function () { show(layer.key); });
      tabEls[layer.key] = btn;
      tabs.appendChild(btn);
      if (i === 0) btn.classList.add('is-active');
    });

    host.appendChild(tabs);
    host.appendChild(panel);
    show('web');
  }

  /* ============ 3. 工具卡片 ============ */
  var TOOLS = [
    {
      name: 'add_expense',
      sign: '记录一笔支出',
      desc: '用户说「午饭 25」时调用。金额单位是元；分类必须从枚举（餐饮/交通/购物/娱乐/居住/医疗/教育/其他）里选。',
      example: 'add_expense({"amount": 25, "category": "餐饮", "note": "午饭"})',
      effect: 'SQLite 新增一行，返回 {"id": 1, "amount": 25.0, ...}'
    },
    {
      name: 'list_expenses',
      sign: '查明细',
      desc: '按月 / 分类列出记录。模型要删除某笔之前，也会先用它找到目标 id。',
      example: 'list_expenses({"month": "2026-10", "limit": 20})',
      effect: '返回记录数组，按日期倒序排列'
    },
    {
      name: 'get_summary',
      sign: '做统计',
      desc: '计算某个月的总额、笔数和分类汇总。模型回答「花了多少」之前必须调用它，不许编造数字。',
      example: 'get_summary({"month": "2026-10"})',
      effect: '返回 {"total": 25.0, "count": 1, "by_category": [...]}'
    },
    {
      name: 'delete_expense',
      sign: '删记录',
      desc: '按 id 删除一条记录。系统提示要求模型「先 list 找到它，再删」，避免删错。',
      example: 'delete_expense({"id": 1})',
      effect: '返回 {"deleted": true}，账本少一行'
    }
  ];

  function mountTools(host) {
    if (host.dataset.mounted) return;
    host.dataset.mounted = '1';
    host.classList.add('wgt', 'wgt-toolbox');

    var head = h('div', 'wgt-head');
    head.appendChild(h('div', 'wgt-title', '四个工具，点开看细节'));
    head.appendChild(h('div', 'wgt-sub', '这就是模型「说明书」里列出的全部能力'));
    host.appendChild(head);

    var wrap = h('div', 'wgt-tools');
    TOOLS.forEach(function (tool, i) {
      var card = h('div', 'wgt-tool' + (i === 0 ? ' is-open' : ''));
      var headRow = h('div', 'wgt-tool-head');
      headRow.appendChild(h('code', null, tool.name));
      headRow.appendChild(h('span', 'wgt-tool-sign', tool.sign));
      headRow.appendChild(h('span', 'wgt-tool-arrow', '▶'));
      headRow.addEventListener('click', function () {
        card.classList.toggle('is-open');
      });
      card.appendChild(headRow);

      var body = h('div', 'wgt-tool-body');
      body.appendChild(h('p', null, tool.desc));
      body.appendChild(h('div', 'wgt-plabel', '示例调用'));
      body.appendChild(h('pre', null, tool.example));
      body.appendChild(h('div', 'wgt-tool-effect', '实际效果：' + tool.effect));
      card.appendChild(body);
      wrap.appendChild(card);
    });
    host.appendChild(wrap);
  }

  /* ============ 挂载 ============ */
  function mountAll() {
    document.querySelectorAll('[data-widget="agent-loop"]').forEach(mountAgentLoop);
    document.querySelectorAll('[data-widget="architecture"]').forEach(mountArch);
    document.querySelectorAll('[data-widget="tools"]').forEach(mountTools);
  }

  function schedule() { setTimeout(mountAll, 60); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
  window.addEventListener('hashchange', schedule);
  document.addEventListener('DOMContentLoaded', function () {
    var main = document.getElementById('main');
    if (main && window.MutationObserver) {
      var timer = null;
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(mountAll, 80);
      }).observe(main, { childList: true, subtree: true });
    }
  });
})();
