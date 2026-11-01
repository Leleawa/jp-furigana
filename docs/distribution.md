# 构建与商店分发

## 项目标识与配置

- 名称：日语歌词振假名；插件标识：`jp-furigana`；作者：leleawa。
- [源码与说明](https://github.com/Leleawa/jp-furigana)、[问题反馈](https://github.com/Leleawa/jp-furigana/issues)和 manifest 作者链接均指向原仓库。
- RefinedNowPlayingNext 为可选适配，已适配 3.0.2；未安装时使用 BetterNCM 插件设置与受支持的原歌词页面。
- 原版设置继续存入 `jp-furigana.config`。仅在没有原版设置时复制 Plus 偏好一次；已有原版配置优先，Plus 原配置不修改。不导入桌面专用设置。
- 歌曲文件继续使用 `<BetterNCM 数据目录>/lyrics/jp-furigana/<歌曲 ID>.json`；网站字段、`manualSource` 与 `userEdits` 保持原结构，每曲一个文件。

从 Plus 迁移时先退出网易云，把 Plus 包移到插件目录外，再安装本版。人工纠音与网站 JSON 无需转换；自定义路径也可继续使用。不要将实际歌词、用户修改、代理地址或账号凭据放入源码和发布包。

## 本地构建

商店登记子目录 `/src`，其中包含网页运行脚本、预览图、离线词典及许可副本。没有 PowerShell 脚本、原生可执行组件或外部进程依赖。`node tools/pack.js` 的文件清单与 `/src` 一致，manifest 位于 ZIP 根层。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:store
npm test
node tools/test-rnp-dom.js slide noruby
node tools/test-rnp-dom.js lyricbar
node tools/pack.js
```

本地产物是 `builds/jp-furigana.plugin`，共 26 项文件。商店会将预览图单独发布，所以商店包与本地包的预览图封装方式不同，运行源码一致。

在 Windows 额外执行真实文件原子保存测试：

```sh
node tests/cache-write.test.cjs
```

## CI 与上游发布

[CI](https://github.com/Leleawa/jp-furigana/actions/workflows/ci.yml) 保留原有 `main` 自动发布行为：

1. `test` 在 Linux 执行语法、分发、离线回归、六种 RNP / LyricBar 兼容场景与打包检查，并上传仅含 `.plugin` 的 artifact。
2. `windows-save` 在 Windows 执行文件原子替换、并发冲突和临时文件清理测试。
3. 只有上述两项作业都成功，且事件为 **Leleawa/jp-furigana 的 main 推送**时，发布作业才以 `contents: write` 创建 `v<manifest.version>` Release，附上同一轮检查的 `.plugin`。标签已存在则跳过。
4. Fork 与 PR 运行相同检查，但此工作流不会替 fork 自动发布，也不快进其他分支。

透明桌面注音、C# 编译、二进制来源记录、绘制进程启动与桌面窗口管理不属于本分支。它们由独立的 [Plus 分支](https://github.com/CarrotLouis/jp-furigana/tree/standalone) 维护，使用自己的发布流程。

## 网络、进程与本地数据

- 默认读音来源是网易云音译；外部网站需用户选择。在音译／词典模式主动进入编辑时，如果缺少网站数据，也会先尝试网站获取；可两次点击明确中断后编辑。
- 仅当前歌曲原歌词确认包含日语时触发注音与外部网站获取；曲名、歌手、翻译、制作信息和旧曲残留不作为判断依据。
- 外部请求向 UtaTen 或歌ネット发送歌名、歌手或歌词页 URL；歌词片段核对在本地完成。地址限定 HTTPS，验证 TLS，不绕过登录或验证码。
- 网站请求使用浏览器 fetch，沿用浏览器当前网络；需要代理时使用系统代理。插件不提供独立代理，不修改网络配置，不调用网易云未公开的代理接口。失败回退并显示原因，重试有界，无全曲库爬取任务。
- UtaTen 使用按需创建、禁用脚本的站内文本页作为请求上下文，请求结束即移除；网站 HTML 仅离线解析，不插入歌词 DOM 执行。
- 歌曲 JSON 仅存本地，无遥测、缓存上传或公共歌词数据库。BetterNCM 文件接口完成临时写入、校验、替换、恢复和删除，无外部保存进程。

## 许可与外部内容

插件代码保留上游 MIT 许可与版权声明；kuromoji 的 Apache 2.0 许可、修改说明及 IPADIC 的 NAIST／ICOT 声明均随源码和包保留。详见 [LICENSE](../LICENSE)、[NOTICE](../NOTICE.md) 和 [Apache 许可全文](../LICENSE-kuromoji.txt)。

代码开源许可不授予歌词内容的使用权。当前没有取得 UtaTen 或歌ネット针对本插件的个别书面数据授权：

- [歌ネット使用条款](https://www.uta-net.com/info/kiyaku.html)限制未经许可的复制、分发及抓取。
- [UtaTen 使用条款](https://utaten.com/index/agreement)第 8 条将个人非营利浏览以外的复制、转载、修改等使用列为需要事先书面许可。

外部来源的自动获取和本地缓存存在需要另行确认的条款问题；关闭自动重试、保留来源链接或不随包分发歌词，均不等于获得授权。商店提交应完整披露此行为与授权状态，由维护者判断是否收录或要求调整。发布包不包含实际下载的歌词缓存。

## 商店更新路径

继续使用原插件 `jp-furigana` 的原仓库登记和 `/src`；无需新建独立插件条目。商店的源码更新脚本读取登记仓库及分支，生成 `plugins-data` 更新审核 PR。审核合并后，打包工作流把预览图发布到 `previews/`，将运行文件打成 `.plugin` 并更新索引；不需要把手工生成的插件包提交到插件库。

Plus 版保留独立条目并继续维护，不因本 PR 自动下架。两者分开发布；仓库推送成功不等于商店已完成更新。

流程参考：[插件库提交说明](https://github.com/BetterNCM/BetterNCM-Plugins#插件提交及更新)、[官方上架准则](https://github.com/std-microblock/chromatic/wiki/插件商店上架插件方式及准则)、[源码更新脚本](https://github.com/BetterNCM/BetterNCM-Plugins/blob/master/scripts/update-plugins/update-plugins.js)和[打包工作流](https://github.com/BetterNCM/BetterNCM-Plugins/blob/master/.github/workflows/pack-and-push.yml)。

基础网页逻辑保留原有 2.10.x / 3.x 适配，不把 DOM 模拟测试表述成所有版本实机验证。完整边界见 [验证记录](validation.md)。
