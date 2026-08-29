# 文档中心

Netlify(前端托管) + Supabase(数据库/认证/存储) 搭建的内部文档分享站。
权限模型：分组授权 + 个人覆盖(deny 优先)，10 人左右规模、邀请制注册、无匿名分享、无版本管理。

---

## 如果你是已经部署过一次的老项目，这次要多做几步

1. **数据库**：在 SQL Editor 里跑一次 `supabase/migrations/001_admin_only_upload.sql`（把上传权限收紧为仅管理员，不用重跑整个 schema.sql）。
2. **Auth URL 配置**：见第 8 节第 5 步，配好 Site URL 和 Redirect URLs，邀请链接才能正常跳转到设置密码页。
3. **Edge Function**：`invite-user` 这次改了代码（加了 CORS），需要重新 `supabase functions deploy invite-user` 才会生效，光改前端没用。
4. **前端**：重新构建、重新拖一次部署（或者重连 Git 走自动部署），新增了"设置密码"/"修改密码"页面和暗色模式。

---

## 0. 先搞懂这两个东西是干什么的

**Supabase** 可以理解成"一整套后端能力,你不用自己写服务器"：
- 一个真正的 Postgres 数据库(不是阉割版,支持你平时用的 SQL 全部语法)
- 用户登录/注册(Auth),不用自己写密码加密、邮件验证这些
- 文件存储(Storage),类似阿里云 OSS / S3
- **行级安全(RLS)**——这是这个项目的核心：你可以直接在数据库层写规则,"用户 A 只能看到自己有权限的那几行数据",前端代码即使写错了也泄露不出去,因为数据库自己就把不该给的行挡住了。

**Netlify** 就是"前端托管 + 自动部署"：
你把代码传到 GitHub,Netlify 监听这个仓库,你每次 `git push`,它就自动重新构建、发布一个新版本,给你一个 `xxx.netlify.app` 的网址(也能绑自己的域名)。它自己不存数据、不跑后端逻辑——所有"数据库/登录/存储"的活都是 Supabase 干的,Netlify 只管把写好的网页发布出去。

一句话总结这套组合：**Netlify 负责"让人访问到这个网站",Supabase 负责"这个网站背后的数据、账号、文件"。**

---

## 1. 注册并创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com)，用 GitHub 账号注册登录。
2. 点 **New project**，填项目名(比如 `doc-share`)、设一个数据库密码(记下来，后面用不太到但要留档)、选一个离你近的区域(新加坡 `ap-southeast-1` 对你来说延迟最低)。
3. 等 1-2 分钟项目初始化完成，会进入项目 Dashboard。

## 2. 建表 + 写入权限规则

1. 左侧菜单找到 **SQL Editor**。
2. 把 `supabase/schema.sql` 整个文件的内容复制粘贴进去，点 **Run**。
   这一步会建好所有的表(`documents`、`profiles`、`groups` 等)、启用 RLS、写好权限判断逻辑。
3. 如果报错，大概率是因为重复执行了一次(表已存在)——正常情况下从空项目跑一次不会有问题。

## 3. 建 Storage bucket

1. 左侧菜单 **Storage** → **New bucket**。
2. 名字必须叫 `documents`(和 schema.sql 里的 policy 对应)。
3. **不要勾选 Public**——保持 private，权限完全靠 schema.sql 里已经写好的 storage policy 控制，谁能看数据库里那条文档记录，谁才能读到对应的文件。

## 4. 把自己设成第一个管理员 + 网站拥有人

1. **Authentication → Users → Add user**，用你自己的邮箱创建账号（这一步先手动建，后面团队成员就用"邀请"功能，不用你手动建了）。
2. 回到 **SQL Editor**，执行(邮箱换成你自己的)：
   ```sql
   update public.profiles set is_admin = true, is_owner = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. 这样你就是管理员了，能看到全部文档和管理后台。`is_owner` 是唯一能在"账号管理"页面里任命/撤销其他人管理员身份的角色，这一步只需要跑一次——以后新增管理员就直接在界面上操作，不用再回来跑 SQL。

## 5. 拿到前端要用的密钥

**Project Settings → API**，页面上有两个值待会儿要用：
- `Project URL`（形如 `https://xxxxx.supabase.co`）
- `anon public` key（一长串字符）

这两个值是"公开"的——前端代码里本来就要暴露给浏览器，安全性靠的是 RLS 而不是隐藏这个 key。**千万不要把 `service_role` key 放到前端**，那个是万能钥匙，只能用在 Edge Function 这种服务端环境里。

## 6. 本地跑起来看看

```bash
cd doc-share
npm install
cp .env.example .env
# 编辑 .env，把第 5 步拿到的两个值填进去
npm run dev
```

打开 `http://localhost:5173`，用第 4 步建的账号登录，应该能看到空的文档列表 + "按用户设置权限"菜单。

## 7. 部署 Edge Function（邀请新成员用）

这一步是可选的，如果你暂时想手动在 Supabase 后台给每个人建账号，可以先跳过这步，之后再回来做。

1. 安装 Supabase CLI（Mac: `brew install supabase/tap/supabase`；其他系统看 [官方文档](https://supabase.com/docs/guides/cli)）。
2. 在项目根目录：
   ```bash
   supabase login
   supabase link --project-ref xxxxx   # xxxxx 是你项目 URL 里那串 ID
   supabase functions deploy invite-user
   ```
3. Edge Function 需要 `SUPABASE_SERVICE_ROLE_KEY` 这个环境变量，Supabase 项目里默认已经自动注入，不用你手动配置。
4. 部署成功后，回到网站的"按用户设置权限"页面，顶部就有"邀请新成员"的表单了，填邮箱发出去，对方会收到 Supabase 发的邀请邮件，点进去设置密码即可登录。
5. **邀请邮件的跳转链接需要额外配置一步**，否则点进邮件会打不开或跳到错误的地方：Supabase 后台 **Authentication → URL Configuration**，把 **Site URL** 设成你 Netlify 网址（比如 `https://xxxx.netlify.app`），**Redirect URLs** 里加一条 `https://xxxx.netlify.app/set-password`。这一步不做，`/set-password` 那个"设置密码"页面收不到邀请链接带的登录信息。

如果暂时不想折腾 Edge Function / CLI，也可以先用最简单的方式邀请人：Supabase 后台 **Authentication → Users → Invite user**，直接填邮箱，效果是一样的（同样要先做好上面第 5 步的 URL 配置，邀请链接才能正常跳转）。

## 8. 部署到 Netlify

1. 把这个项目推到一个新的 GitHub 仓库（私有仓库即可，Netlify 支持连私有仓库）。
2. 打开 [netlify.com](https://netlify.com)，**Add new site → Import an existing project**，选你刚才那个仓库。
3. 构建配置 Netlify 会自动读到 `netlify.toml`（build command 是 `npm run build`，发布目录是 `dist`），一般不用改。
4. **重点**：在 **Site settings → Environment variables** 里加上这两个（和第 5 步一样的值）：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Vite 只会把 `VITE_` 开头的变量打包进最终代码，这是 Vite 的约定，不是随便起的名字，改了前缀会读不到。
5. 点 **Deploy site**，1-2 分钟后会给你一个 `xxx.netlify.app` 的网址，团队成员之后就访问这个网址登录。

## 9. 日常怎么用

- 建分组、邀请成员、设置权限：登录后管理员账号能看到"按用户设置权限"和"按文档设置权限"两个菜单，两个是同一份数据的两种查看方式，改哪边都一样生效。
- 上传文档：任何登录用户都能在文档列表页上传（上传后默认只有自己能看到，要分享给别人需要管理员去权限页面给对应的组或个人开权限）。
- 查日志：管理员能在"日志"页看到全站的查看/下载/权限变更记录。

---

## 已知限制 / 后续可以加的东西

- **Word/Excel 在线预览还没做**，目前这两种格式只能下载后用本地软件打开。如果后面确实需要在线预览，思路是上传时用 LibreOffice 转一份 PDF 存着，按需再聊怎么接。
- **邀请邮件的模板/发件域名**用的是 Supabase 默认配置，正式使用前建议去 **Authentication → Email Templates** 看一眼，顺手把中文文案改一下。
- 免费版 Supabase 有 500MB 数据库 + 1GB Storage 的限制，10 人规模短期内够用，文档存多了可以再评估要不要升级到 Pro（$25/月起）。
