# 可见之年 · Visible Year

**年龄就是权限。** 一个互动网页游戏：你的「制度年龄」只会增长，从不后退；年龄每过一道门槛，就多一项能干预别人的权限——直到 80 岁，拿到 ROOT。

*Age is permission. An interactive web game about institutional age: it only goes up, and every threshold unlocks one more way to decide for someone else — until you reach ROOT at 80.*

> 项目内部名称：《静默星图入口系统》(Silent Star Map)

<!-- TODO: 在线试玩链接、截图/GIF 放这里 -->

## 玩法

- 从一张「公共服务星图」进入不同场所：极光弹珠台、没有规则的雪仗、秘密交换、夜间超市、回声校准……
- 系统每隔一段时间要求你确认制度年龄。年龄只能增加；80 岁之前可以暂时维持，但无法回头。
- 25–80 岁每 5 岁开放一个管理控制台：档案、联系、可见性、申诉、准入、消费与价格、劳动调度、恢复、身份、记忆、规则制定，最后是根权限。
- 权限越大，能改变的越多，不可逆的后果也越多。

## 技术

纯前端，无需构建：HTML / CSS / JavaScript，three.js（3D 物件）、p5.js（生物）、Web Audio。中英双语（`locales/`）。

本地运行：

```bash
python3 -m http.server 8000
# 然后打开 http://localhost:8000
```

更详细的结构与交互说明见 [PROJECT_FRAMEWORK.md](./PROJECT_FRAMEWORK.md)。

## 版权

© 2026 Shun. All Rights Reserved.

源码公开仅供查看与学习参考。未经事先书面许可，不得复制、再分发、商用、用于学术提交或作品集、或创作衍生作品。详见 [LICENSE](./LICENSE)。
