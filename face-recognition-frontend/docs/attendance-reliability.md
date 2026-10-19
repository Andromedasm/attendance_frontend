# 考勤异常处理与验证

识别阈值、活体模型及参数、出退勤规则、设备时间、分店映射及主备数据库选择保持原样。多人选择和覆盖确认增加下述校验。

## 多人选择与确认

- 一张脸继续使用原单人流程；多张脸先返回候选，确认前不写考勤。
- 名单显示头像、姓名、员工编号和打刻类型，默认不选择任何人；未识别或活体未通过的人不可选。
- 可勾选一人或多人。提交时重新拍摄，只为本次明确选中且在新照片中核验通过的员工写入，活体与身份匹配始终使用同一张脸。
- 多人结果逐人显示，成功、失败和需要覆盖分别处理；不会自动重发部分失败的批次。
- 选择及覆盖确认凭证由后端签发，20 秒有效、只可使用一次。页面也检查绝对期限，切换到下一个待确认员工不会延长其期限。
- 覆盖确认显示员工头像、姓名、编号、类型和全部待覆盖记录时间。YES 会重新拍摄核对本人，后端检查同一数据库中的原记录版本未变；变化或到期要求重新打刻。
- 取消、切换类型、进入后台、离开页面或摄像头轨道结束会清除页面的待确认内容；回到页面需要点击 Start Video 恢复。等待拍摄期间切换类型，旧操作也不能继续上传。
- Safari 的短暂 `pause`、`emptied` 或轨道 `mute` 不会直接关闭摄像头，也不会延长确认期限。用户确认时恢复播放、等待新帧并重新核验本人；拍摄/编码中发生中断会拒绝使用该图片。
- 凭证仅存于现有单 worker 后端内存，服务重启会使待确认凭证失效；不保存照片或人脸 embedding。当前 `workers=1` 的部署方式保持原样。

## 前端

- 相机启动上限为 10 秒，截图编码上限为 5 秒。
- 截图前检查视频、摄像头轨道及页面可见性，并等待新的帧进度，上限 2 秒。视频帧回调比较连续两次递增的 `presentedFrames`，不比较 `mediaTime` 与 `currentTime`：实时摄像头的 `mediaTime` 可以一直为 0。
- 不支持视频帧回调时依次使用解码帧计数（`totalVideoFrames`、`webkitDecodedFrameCount`）。只有没有可用计数器的旧浏览器才回退到视频时间；此回退证据弱于真实帧计数，需要对应旧款 iPad 现场验证。已支持的帧回调或计数器停滞时，不用播放时钟掩盖停滞。
- 单次打刻（包括截图、上传和读取完整 JSON）上限为 30 秒；确认覆盖也使用同一期限。
- 保持原有 PNG 无损图像输入，不通过降低照片质量缩短上传。
- 截图超时、编码异常会恢复按钮并保留原摄像头流，阻止本次上传；可重新操作。短暂播放中断不强行释放摄像头；真正停止、进入后台或离开页面仍释放相机。持续无法恢复时，可手动点击「カメラを再起動」，不会自动重发打刻。
- 不会自动重发 POST。请求发出后的通信失败不代表服务器没有写入，界面会提示先核对打刻记录；迟到响应不会显示成功或覆盖下一次操作。

前端当前由 Vite 提供，修改可被加载；现场 iPad 应重新加载页面以确保运行新版本。

## 后端

- 每次上传使用独立的临时目录，避免相同上传文件名在不同分店之间冲突。
- 成功归档的照片按原规则保存。归档移动失败时，仍保留独立备用文件。
- 处理失败会清理临时文件，数据库异常会回滚并关闭资源。
- 后端由 `facerecognition-fastapi-backend.service` 运行，Python 修改需要重启服务后生效。

## 定位下一次网络问题

日志位于 `/home/bubble/fastapi_backend/logs/app.json.log`，时间为 UTC（日本时间减 9 小时）。

- `request_started`：服务器收到请求头，尚未等待完整上传。
- `attendance_processing_started`：上传解析和线程调度已完成，`preprocessing_ms` 包含这部分等待，不能直接视为上传耗时。
- `attendance_stage_started` / `attendance_stage_finished` / `attendance_stage_failed`：识别、活体、人脸缓存、分店查询、考勤数据库各阶段。
- `request`：响应完成；`request_failed` / `request_cancelled`：请求异常或被取消。

各记录用 `request_id` 关联，响应头也包含 `X-Request-ID`。`forwarded_client_ip` 用于查找例如 `192.168.56.x` 的分店来源；它仅是转发头诊断信息，不是经过认证的客户端地址。保留原有代理信任及分店判断方式。

如果有 `request_started`，但很久才出现 `attendance_processing_started`，先排查上传和线程排队；如果某个处理阶段开始后没有结束，检查该阶段。前端取消等待不能保证停止服务器中已经运行的 GPU 操作或数据库提交。

## 回归验证

前端（项目目录）：

```bash
npm run test:attendance
npm run build
```

后端（`/home/bubble/fastapi_backend`）：

```bash
PYTHONDONTWRITEBYTECODE=1 venv/bin/python -m unittest tests.test_attendance tests.test_attendance_participants tests.test_request_logging tests.test_connections tests.test_face_cache tests.test_timecard_sync
```

测试使用浏览器、GPU 和数据库的替身，不执行真实打刻，不修改考勤数据。前端覆盖 `mediaTime=0`、不同时间轴、帧计数停滞、弹窗中的临时暂停/静音、恢复与原到期时间、编码中断、提交后中断，以及手动重启。真实 iPad 摄像头与 VPN 的现场验证仍需在该设备和链路上完成。
