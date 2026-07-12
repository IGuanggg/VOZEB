# 上游来源与二次开发说明

VOZEB 是一个基于开源项目继续开发的 AI 无限画布。本文件用于明确上游来源、参考项目、许可证以及本仓库的二次开发范围。

## 主项目上游

- 项目：[csyqlz/vozeb](https://github.com/csyqlz/vozeb)
- 关系：本仓库通过 GitHub Fork 创建，并在其代码基础上继续开发。
- 许可证：GNU Affero General Public License v3.0，详见根目录 [LICENSE](LICENSE)。
- 更早的无限画布与 Agent 能力来源，在上游文档中归功于 `basketikun/infinite-canvas` 及相关开源贡献者。

本仓库不是上游官方版本。二次开发产生的问题、部署配置和功能差异由本仓库维护者负责。

## 3D 导演台

- 参考及集成来源：[jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk)
- 本仓库位置：`director-desk/`
- 许可证：该子项目保留自身的 MIT License，详见 [director-desk/LICENSE](director-desk/LICENSE)。
- 二开内容：嵌入无限画布、父子页面通信、工程状态持久化、全景图连接、机位截图回传、移动端面板与宿主安全校验。

## 图片超分参考

- 参考项目：[liwei9745/GenBox](https://github.com/liwei9745/GenBox)
- 参考项目：[jianjianai/4k-image-api](https://github.com/jianjianai/4k-image-api)
- 当前实现：浏览器本地运行 UpscalerJS、TensorFlow.js 与 ESRGAN Slim，不依赖付费云端超分服务。
- 模型文件：`web/public/ai-models/esrgan-slim/`
- 模型许可证：详见 [web/public/ai-models/esrgan-slim/LICENSE](web/public/ai-models/esrgan-slim/LICENSE)。

本仓库没有直接声称拥有上述参考项目的原创权。相关项目名称、代码和模型仍归各自作者及贡献者所有。

## 本仓库主要二开范围

- 面向多人使用的图片任务排队、公平调度和并发控制。
- Chat2API 用户密钥、账号池轮询、坏账号重试和图片结果回填适配。
- 无限画布图片节点工具栏、编辑器、引用持久化和移动端手势修复。
- 3D 导演台与无限画布的双向通信。
- 本地 AI 超清及失败时的高质量兼容放大。
- 管理后台、用户权限、积分、公告、模型渠道与部署配置增强。

提交代码、分发镜像或对外提供网络服务时，请继续遵守根项目 AGPL-3.0 以及各子项目和模型资产的许可证要求。
