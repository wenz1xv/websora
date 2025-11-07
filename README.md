# WebSora - 基于 Nginx 的 Sora API 前端 UI

WebSora 是一个简洁、高效、易于部署的 Web 用户界面，专为与 Sora 视频生成 API 交互而设计。
它仅仅依赖于 Nginx 进行后端 API 代理和认证管理，无需任何其他服务。

整个项目由纯静态文件（HTML, CSS, JavaScript）构成，为你提供了一个开箱即用、响应迅速的视频生成平台。

## ✨ 功能特性

- **纯静态部署**：无需 Node.js、Python 或任何其他后端语言环境，只需一个 Nginx 服务器。
- **响应式设计**：在桌面和移动设备上均有良好的使用体验。
- **直观的用户界面**：
    - 支持通过文本提示词（Prompt）生成视频。
    - 支持上传参考图片进行视频生成。
    - 可选择视频方向（横屏 16:9 / 竖屏 9:16）。
- **强大的任务管理**：
    - 实时任务列表，自动轮询更新任务状态（排队中、生成中、已完成、失败）。
    - 任务进度可视化显示。
    - 所有任务状态持久化存储在浏览器本地（LocalStorage）。
- **结果展示与管理**：
    - 按视频方向分类展示生成的视频结果。
    - 支持在线预览、下载和删除生成的视频。
- **多密钥轮询**：通过 Nginx 配置，可实现多个 API Key 的随机轮询，有效分担请求压力。
- **暗黑模式**：自动适配系统的颜色主题。

## 🚀 工作原理

本项目的核心架构非常轻量：

1.  **前端 (HTML/CSS/JS)**：用户在浏览器中与之交互的静态界面。它负责收集用户输入（如提示词、图片），并将视频生成请求发送到后端的 `/webSora/v1/videos` 路径。
2.  **Nginx (反向代理)**：作为唯一的服务端组件，Nginx 扮演着至关重要的角色：
    - **静态文件服务器**：托管 `html` 目录下的所有前端文件。
    - **API 网关**：监听特定路径（例如 `/webSora/v1/videos`），并将所有收到的请求转发到真实的 Sora API 服务端（例如 `https://api.ephone.chat`）。
    - **认证注入**：在转发请求时，Nginx 会根据配置自动在请求头中添加 `Authorization` 字段（API Key），从而避免了将密钥直接暴露在前端代码中的安全风险。
    - **负载均衡/轮询**：可以配置多个 API Key，Nginx 会根据前端传递的 `keyidx` 参数或随机选择一个 Key 来使用。

这种设计将所有与后端服务的通信和认证逻辑都集中到了 Nginx 层，使得前端可以保持纯净和无状态，极大地简化了部署和维护。

## 🛠️ 部署指南

部署 WebSora 非常简单，你只需要一个安装了 Nginx 的服务器。

### 步骤 1: 上传文件

将 `html` 目录下的所有文件 (`index.html`, `script.js`, `style.css`) 上传到你的服务器的网站根目录，例如 `/var/www/html`。

### 步骤 2: 配置 Nginx

1.  打开你的 Nginx 配置文件（通常位于 `/etc/nginx/nginx.conf` 或 `/etc/nginx/sites-available/default`）。
2.  将项目提供的 `default` 配置文件中的内容复制或整合到你的 Nginx 配置中。

关键配置段落解释如下：

```nginx
# /etc/nginx/sites-available/default

# 定义 API Key 映射
# 你可以在这里添加更多的 Key
map $http_keyidx $selected_auth_key {
    "0"   "Bearer sk-key1";
    "1"   "Bearer sk-key2";
    "2"   "Bearer sk-key3";
    # ...
    default "Bearer sk-default-key"; # 默认 Key
}

# 你的 Sora API 服务端地址
set $api_url "api_url_here"; # 例如 https://api.a.b

server {
    listen 80; # 或者 443 (如果使用 SSL)
    server_name your_domain.com; # 你的域名
    root /var/www/html; # 网站文件根目录
    index index.html;

    client_max_body_size 100M; # 允许上传大文件

    # API 代理核心配置
    location /webSora/v1/videos {
        proxy_redirect    off;
        proxy_set_header Host $api_url; # 目标 API 服务器的 Host
        proxy_set_header Authorization $selected_auth_key; # 注入上面 map 中选择的 Key
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass $api_url/v1/videos; # 将请求转发到目标 API
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

**重要提示**:
- 请务必将 `sk-key1`, `sk-key2` 等替换为你自己的有效 API 密钥。
- 根据需要修改 `$api_url` 为你的 API 服务地址。
- 确保 `root` 指令指向你上传 `html` 文件的正确路径。

### 步骤 3: 重启 Nginx

保存配置文件后，执行以下命令来检查配置语法并重启 Nginx 服务：

```bash
sudo nginx -t
sudo systemctl restart nginx
```

现在，通过你的服务器 IP 或域名访问，即可看到 WebSora 的界面并开始使用。

## 📄 使用说明

1.  **打开界面**：在浏览器中访问你的服务器地址。
2.  **输入提示词**：在 "提示词" 输入框中详细描述你想要生成的视频内容。
3.  **选择视频方向**：根据需要选择 "横屏" 或 "竖屏"。
4.  **(可选) 上传参考图**：点击 "选择图片" 上传一张图片作为视频生成的参考。
5.  **生成视频**：点击 "=> 生成视频" 按钮提交任务。
6.  **查看任务**：提交后，任务会出现在下方的 "任务列表" 中，并自动更新状态。
7.  **获取结果**：任务完成后，视频会出现在底部的 "生成结果" 区域。你可以点击预览、下载或删除它。

---

祝你使用愉快！