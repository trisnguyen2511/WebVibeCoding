# Jira Proxy Electron — Version History

Mỗi lần chỉnh sửa bất kỳ file nào trong thư mục này → tăng version lên 1.

## Rules

- Tăng version trong `package.json` và cập nhật bảng dưới
- Build: `npm run build` (compile TypeScript)
- Trigger build: GitHub Actions `build-jira-proxy.yml` trên branch `master` với `publish: true`
- Build output: `jira-proxy-setup.exe` (Windows), `jira-proxy-mac.dmg` (macOS), `jira-proxy-linux.AppImage`

## Version log

| Version | Ngày       | Thay đổi                                                                 |
|---------|------------|--------------------------------------------------------------------------|
| 1.0.0   | 2026-09-20 | Khởi tạo: CORS proxy, PAT auth, NSIS installer                          |
| 1.1.0   | 2026-09-21 | Auto-updater, system tray, auto-start                                    |
| 1.2.0   | 2026-09-22 | UI redesign: SVG icons, log panel, health button                        |
| 1.3.0   | 2026-09-22 | Dark theme + light theme, CSP, proxy log với status color               |
| 1.4.0   | 2026-09-23 | Toast notification cho update check; làm sạch error message từ updater; tăng độ sáng dark palette |
| 1.5.0   | 2026-09-23 | UI rewrite khớp với approved preview (exact CSS tokens); 404 từ updater → "no update" thay vì error |
