# OUR ORBIT

两个人的私人星空相册。保留动态封面、星轨、穿梭和平铺三种照片视图；进入相册后用两个独立账号登录。照片文件保存在腾讯云 CloudBase 私有存储，照片资料保存在只有这两个 UID 可读写的数据库集合。

## 打开网页

- GitHub 固定入口：https://tuhongqing.github.io/our-orbit-album/
- 实际相册：https://lele2007-d8g88p15969cad71e-1449216356.tcloudbaseapp.com/

由于当前 CloudBase 体验版不允许添加 GitHub Pages 安全域名，GitHub 入口会跳转到 CloudBase 自带域名。腾讯云测试域名首次访问可能显示访问提示。**不要把账户密码或私人照片提交到公开 GitHub 仓库。**

登录资料只在本机 `../cloud-admin/private/相册登录信息.txt`，该目录已忽略。两个账户是 `yt` 和 `yyj`。网页可分批选择最多 1000 张 JPEG、PNG、WebP 或 GIF 照片上传，单张最多 25 MB；不兼容的 HEIC、LIVP 文件须先转换成这些格式。网页上传同时保存原图与独立预览图。曾经存在浏览器 IndexedDB 的照片可在登录后点“同步这台电脑以前导入的照片”，不会自动删除本地副本。

云端环境的体验版有效期目前显示至 2027-01-02，到期前需续期以维持访问。云存储和数据库也不替代独立备份，请保留百度网盘或硬盘上的原始文件。

## 本地开发

在 `album-web` 目录执行 `npm install`、`npm run dev`，访问 http://127.0.0.1:4173/。发布静态文件执行 `npm run build`，输出在被忽略的 `dist/`。当前体验版不能添加本机安全域名，因此本地可预览封面和布局，云端登录请使用已部署的 CloudBase 域名。

原作者效果参考与许可见 [UPSTREAM-LICENSE.txt](UPSTREAM-LICENSE.txt)。
