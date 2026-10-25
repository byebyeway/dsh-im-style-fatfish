# NOTICE

## Bundled artwork

`assets/faces/*.jpg` — 12 expression images (384×384, ~38 KB each) copied from
the `dafeiyu-001` gallery shipped in the npm package **`dsh-meme@0.1.60`**
(MIT, <https://github.com/yyh-001/dsh-meme>).

They are vendored into this package so the avatar keeps working offline and
without `dsh-meme` installed. Copyright of the artwork belongs to the
`dsh-meme` gallery owners; the MIT license of `dsh-meme` covers its code.
If you redistribute this package, keep this notice and check the upstream
gallery's terms for the images.

| file | source path in `dsh-meme` |
|---|---|
| `hello.jpg` | `memes/dafeiyu-001/memes/morning/zaoshanghao.jpg` |
| `think.jpg` | `memes/dafeiyu-001/memes/confused/jiazai.jpg` |
| `work.jpg` | `memes/dafeiyu-001/memes/cpu/jiaban.jpg` |
| `slack.jpg` | `memes/dafeiyu-001/memes/work/tangping.jpg` |
| `talk.jpg` | `memes/dafeiyu-001/memes/happy/ok.jpg` |
| `rice.jpg` | `memes/dafeiyu-001/memes/daily/ganfan.jpg` |
| `proud.jpg` | `memes/dafeiyu-001/memes/happy/deyi.jpg` |
| `tsun.jpg` | `memes/dafeiyu-001/memes/shy/haixiu.jpg` |
| `fuzz.jpg` | `memes/dafeiyu-001/memes/angry/shengqi.jpg` |
| `boom.jpg` | `memes/dafeiyu-001/memes/sad/yun.jpg` |
| `dead.jpg` | `memes/dafeiyu-001/memes/sleep/shuijiao.jpg` |
| `broke.jpg` | `memes/dafeiyu-001/memes/givemoney/yaoqian.jpg` |

## Runtime dependencies

No third-party runtime dependencies. The plugin imports only Node built-ins
(`node:crypto`, `node:fs`, `node:path`, `node:url`) and uses the Harness
services (`webServer`, `llm`, `agentDefaultModel`, `slots`, `sessions`,
`uiConversation`).
