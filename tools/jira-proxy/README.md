# Jira CORS Proxy

Local proxy để bypass CORS khi gọi Jira nội bộ từ Timeline tool.

## Cách dùng

### Download exe (Windows)
Tải `jira-proxy.exe` từ Releases, chạy:
```
jira-proxy.exe https://jira.company.com
```

### Build từ source
Yêu cầu: Node.js 18+

```bash
npm install -g pkg
pkg proxy.js --target node18-win-x64 --output dist/jira-proxy.exe
```

## Trong Timeline App

Sau khi chạy proxy, set **Host** trong Jira Integration thành:
```
http://localhost:8765
```

Không cần quyền admin. Ctrl+C để dừng.
