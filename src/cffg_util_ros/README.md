# UTIL 测试集的 ROS1 CFFG 定位与可视化

本程序使用 **uwb_imu_is 的 C++ TightEstimatorCore（GTSAM/iSAM2、IMU 预积分和 TDOA 因子）**进行定位，使用当前 V3 R1-S 模型推理量测 bias 和标准差倍率。神经网络没有替代优化器，也不是在优化后的坐标上直接加偏移。

程序加载已训练的模型执行推理，沿用现有测试划分；Vicon 真值用于评估与可视化。

## 启动

在项目目录中：

```bash
source /opt/ros/noetic/setup.bash
catkin build uwb_imu_transformer uwb_imu_is cffg_util_ros --no-deps -j2 -p1 \
  --cmake-args -DPYTHON_EXECUTABLE=/usr/bin/python3
source devel/setup.bash
rosrun cffg_util_ros run_util_cffg.py --run-id const3-trial7-tdoa3-manual3
```

默认使用 CUDA、当前已评估的 `training/model.pt`，并打开 RViz。模型配置使用与该 checkpoint SHA-256 匹配的历史配置 `epoch_diagnostics_20261002/training_config.yaml`，而非后来修改过选模条件的配置。检查失败时停止，不悄悄改用其他模型或 CPU。

启动入口会检查当前 ROS master，若已有同名实验节点或 `/clock` 发布者则拒绝启动，避免覆盖其他实验。请先退出旧实验，或为本次实验设置独立的 `ROS_MASTER_URI`。不要同时使用另一个 `rosbag play --clock`。

默认数据目录：

```text
/home/jay/uwb_imu_is/data/util_uwb_imu-dataset/dataset/flight-dataset/rosbag-data
```

可用的测试轨迹：

- `const1-trial4-tdoa2`
- `const1-trial4-tdoa3`
- `const2-trial2-tdoa2`
- `const2-trial2-tdoa3`
- `const3-trial7-tdoa3-manual3`
- `const4-trial7-tdoa2-manual1`

例如切换到 const4：

```bash
rosrun cffg_util_ros run_util_cffg.py --run-id const4-trial7-tdoa2-manual1
```

可选参数：`--no-rviz`、`--duration 10`（明确仅测试前 10 秒）、`--rate 0`（尽快处理）、`--optimization-hz 10`、`--prepare-only`、`--output /绝对路径/新目录`。`--exit-on-complete` 会在完成后关闭整套启动进程，适用于无界面测试。默认完成后保留节点和轨迹以便查看，按 Ctrl+C 退出。

默认优化调度为 50 Hz，与既有测试配置一致。`--optimization-hz 10` 改为按传感器时间每 100 ms 收集一个优化批次，每个批次可包含多个 TDOA 状态和多次网络调用。调度参数决定批次划分；实际处理耗时记录在回放结果中。

## 输出话题

| 话题 | 类型 | 含义 |
|---|---|---|
| `/cffg/bias` | `uwb_imu_transformer/UwbFactorValueArray` | 因子图实际采用的量测 bias，单位 m |
| `/cffg/weights` | 同上 | 相对信息权重 `1 / sigma_scale²`，无量纲 |
| `/cffg/corrected_tdoa` | 同上 | 符号转换并扣除 bias 后的 TDOA，单位 m |
| `/cffg/quality` | `UwbFactorQualityArray` | 网络原始输出，包含 sigma_scale、bias 和因子身份 |
| `/cffg/odometry` | `nav_msgs/Odometry` | CFFG 修正因子参与优化后的定位结果 |
| `/cffg/path` | `nav_msgs/Path` | CFFG 轨迹，RViz 橙色 |
| `/baseline/odometry`、`/baseline/path` | `Odometry`、`Path` | 同一 TightEstimatorCore 关闭 CFFG 的传统因子图对照，蓝色 |
| `/util/ground_truth_pose`、`/util/ground_truth_path` | `PoseStamped`、`Path` | 原 bag 的 Vicon 真值，仅供可视化，绿色 |
| `/util/anchors` | `visualization_msgs/MarkerArray` | 当前 const 的测量锚点位置 |
| `/util/replay_status` | `std_msgs/String`（JSON） | PREPARING / RUNNING / COMPLETE / FAILED、处理计数 |

每个修正值均携带测量时间、epoch 时间、锚点对、keyframe、factor_ordinal 和 request_id，不能仅按数组下标或最近到达时间与量测配对。bias、weights、corrected_tdoa 在对应优化批次成功后发布。`used_cffg=false` 表示该值来自中性回退；bag 测试一旦发现回退会停止并标记 FAILED。

按项目现有符号定义，`z_used = -UTIL_tdoa`，`z_corrected = z_used - bias`。因子残差等价于 `h(x) + bias - z_used`。标准差为 `0.15 m × sigma_scale`；权重话题是相对基准信息量的比例，而不是标准差，也不是完整的绝对信息矩阵。

网络需要 32 状态窗口，因此起始阶段使用传统因子图初始化；尚未形成完整窗口时，不会伪造网络预测消息。

## 数据与时序

1. 直接读取指定 bag 的 `/accel_data`、`/gyro_data`、`/tdoa_data`。不使用提前合并的 `/imu_data`，以保持与训练的数据配对语义一致。
2. 加速度由 g 转为 m/s²，角速度由 deg/s 转为 rad/s。调用训练/离线回放已有的 `build_replay_events`：2 ms 范围内一对一因果配对，使用两者较晚时间；TDOA 采用 30 ms 和锚点对唯一性的 epoch 分组。
3. 按时间、IMU/TDOA 优先级发送带确认的 ROS service 批次，只有两支定位器都完成本批后才发送下一批。计算较慢时减慢播放，不跳过传感器数据。`/clock` 与数据时间同步。
4. 完整保留 bag header 的时间，接受时间戳 0。bag 中由原始浮点秒转成 ROS 纳秒的截断可能造成相对 CSV 约 1 ns 的差异；一致性验证使用本次生成的同一份 `events.csv`。
5. Vicon 进入可视化话题，估计器和网络使用 UWB/IMU 输入。可视化显示原 bag 的真值时间与坐标；定量 RMSE 评估使用下文说明的时间对齐和真值插值规则。

## 保存与验证

每次创建独立的 `reports/ros1_cffg/<轨迹与时间>/`，不会覆盖旧结果。包含输入文件哈希、完整参数、适配审查、实际送入 C++ 的 `events.csv`、逐因子 bias/权重/修正量 CSV、两支估计器最终状态历史和完成状态。

完成后还自动生成 `trajectory_comparison.png`（三维轨迹与俯视图）及 `ground_truth_xyz.csv`，便于不打开 RViz 时查看结果。

可进一步核验传感器事件数、消息身份、修正量数值范围和 `z_corrected = z_used - bias`：

```bash
rosrun cffg_util_ros verify_ros_run.py --directory /绝对路径/本次结果目录
```

`baseline` 对照明确是当前共享核心关闭 CFFG，**不是**原始 `uwb_imu_is_tight_node` 的运行结果。原始节点源码及 `uwb_imu_is_tight.launch`/配置均保持不变，仍可另外开展历史版本对照。

批次接口用于确定性 bag 实验。在线传感器使用共享核心节点的 IMU/TDOA 订阅和定时优化：设置 `external_replay_batches=false`，接入完成单位与符号校验的输入，配置响应超时和计算预算。性能统计分别记录 GPU 前向计算和完整定位更新的耗时。

也可在生成 `experiment.yaml` 后以话题订阅模式启动同一套程序：

```bash
roslaunch cffg_util_ros util_cffg.launch \
  experiment_file:=/绝对路径/experiment.yaml replay_bag:=false \
  imu_topic:=/util/imu_si tdoa_topic:=/util/tdoa optimization_hz:=10
```

此模式使用实际传感器时间和订阅输入。IMU 输入为 `sensor_msgs/Imu`，单位为 m/s²、rad/s；TDOA 输入为 `uwb_imu_is/TdoaMeasurement`，须填写锚点身份、量测时间和 `is_epoch_end`。默认按 UTIL 原始方向取负号，已转换符号的输入应设置 `tdoa_input_sign:=1`。`live_timeout_ms` 默认 100 ms，超时显式退回传统量测参数。接入 UTIL 原始异步话题前，需完成单位、符号与消息适配，并配置对应场景的锚点地图和外参。

## 本机验证记录（2026-10-10）

- 4 项 bag 适配测试、8 项现有 runtime/window 测试通过；Catkin 编译及启动 XML 检查通过。
- `const3-trial7-tdoa3-manual3` 前 10 秒：ROS 两支路分别与同一 bag 事件的离线 C++ 回放比较，337 个状态的位置、姿态、速度和 IMU bias 逐位一致。启用 `-O1` 后仍逐位一致。
- `const4-trial7-tdoa2-manual1` 前约 5 秒：267 次 CFFG 推理成功，三个修正量话题各收到 267 条消息，无回退。
- `const3-trial7-tdoa3-manual3` 完整 118 秒：两支路各处理 146,002 条传感器事件、5,900 个优化批次，分别输出 4,043 个状态。4,012 次推理全部成功；26,474 个因子的三种修正量身份一致，`z_corrected = z_used - bias` 的最大数值差为 0。
- RViz 已在 RTX 5060 Ti 上实际启动并检查三条轨迹和锚点显示。完整结果位于项目的 `reports/ros1_cffg_complete_20261010/`，核验结果为 `verification.json`，静态对比图为 `trajectory_comparison.png`。
- 本次完整双支路回放及绘图约耗时 30.4 分钟，完成了功能和数据完整性验证。话题订阅模式已提供启动配置；在线性能评估包括更新延迟、消息排队和数据到达顺序。

## 本地展示网页与轨迹视频

项目根目录 `index.html` 可以直接在浏览器中打开，不依赖网络、CDN 或网页服务器。配套文件位于 `assets/cffg/`；复制网页时须同时保留该目录。本地打开不涉及上传；GitHub Pages 的发布方式见下文。

网页支持页头 `EN / 中文` 切换，每次打开或刷新默认英文，不随浏览器系统语言变化。正文、图例、统计说明、等待提示与无障碍标签同步切换；不会重置所选轨迹、视角、播放进度或速度。视频的固定文字采用英中对照；已有中文 README 链接在英文页面明确标注为中文文档。网站语言代码与实验数据分开保存，后续自动汇总不会覆盖语言设置。

展示选取 `const3-trial7-tdoa3-manual3` 和 `const4-trial7-tdoa2-manual1`，选择依据是此前完整测试中较大的绝对 RMSE 改善。页面另外列出此前全部六条测试轨迹的数值，并分别标注离线评估与 ROS bag 的结果。

- const3 复核并复用 `reports/ros1_cffg_complete_20261010/` 的完整 ROS 回放。
- const4 的新回放及日志在 `reports/cffg_showcase_20261010/const4_ros/`。
- 两个 MP4 视频由已记录的完整状态历史重建。分辨率 1600×900，24 fps，2 倍传感器时间播放，结尾停留 2 秒。传统/CFFG 两幅三维视图使用相同坐标范围与等比例坐标轴。
- 视频和网页的数值使用与既有评估相同的 Vicon CSV 真值、已审查时间偏移以及 20 ms 插值跨度限制。无空间配准、无外推、无误差平滑；缺失真值的状态不计入 RMSE/P95，排除数量记录在各轨迹 summary 中。
- 网页与视频按审查后的时间对齐规则计算误差；`trajectory_comparison.png` 显示原始 bag Vicon 坐标。
- 网页轨迹支持 3D/XY/XZ、时间滑块、播放暂停；数据文件使用本地脚本加载，支持 `file://` 直接打开。

生成方式（只读取结果，不重新训练或修改估计器）：

```bash
/usr/bin/python3 src/cffg_util_ros/scripts/verify_ros_run.py --directory <完整回放目录>
MPLCONFIGDIR=/tmp/cffg-showcase-mpl /usr/bin/python3 \
  src/cffg_util_ros/scripts/make_showcase.py render --directory <完整回放目录>
# 两条轨迹均完成视频生成后：
/usr/bin/python3 src/cffg_util_ros/scripts/make_showcase.py assemble
```

脚本会拒绝未完成、被截断、有推理回退或未经核验的回放；模型、bag、真值与既有时间审查文件都需通过身份核对。MP4 生成后完整解码检查，网页来源记录为 `assets/cffg/showcase_manifest.json`，逐状态数据为 `const3_states.csv`、`const4_states.csv`。`assemble --allow-partial` 用于开发预览，页面显示已核验的部分结果和其余实验的处理状态。

本次 const4 回放同时配有 `scripts/finish_showcase.py` 后续处理程序：等待实际回放完成后依次核验、编码视频、生成完整网页数据、检查浏览器。状态位于 `reports/cffg_showcase_20261010/finalization_status.json`。只有状态为 `COMPLETE` 才代表两条视频与最终网页都已完成；发生错误或 30 分钟无实际进展时记录 `FAILED`，不自动重跑、不改用其他结果。网页打开后若仍显示“准备中”，请在处理完成后刷新。

## GitHub Pages 静态部署

使用 `.github/workflows/pages.yml`，不调用 Jekyll。仓库中的 ROS `ros_logs/latest` 是指向本机绝对路径的符号链接；在 GitHub 服务器上无效，不能把整个仓库作为网页构建或上传目录。现有日志与链接保留原样，不需要删除实验记录。

首次启用：

1. 将本次部署配置和网页文件提交、推送到 `master`。
2. 在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**，不要继续使用 **Deploy from a branch**。此操作需要仓库管理员或维护者权限。
3. 在 **Actions → Deploy CFFG static website → Run workflow** 中选择 `master` 运行。之后，`master` 上的网页、使用文档或打包配置更新会自动触发；也可手动运行。其他分支不部署。
4. 只有 `deploy` 成功才算线上发布完成，站点地址由该任务的 `github-pages` 环境提供。修改本地文件或本地测试通过不等于已部署。

工作流只依赖系统 Python 标准库：先运行打包测试，再由 `scripts/build_pages.py` 创建 `_site/`，最后仅上传 `_site/`。不安装 ROS、PyTorch 或 Jekyll，不运行训练、回放或视频生成。

发布内容采用逐文件明确列表：`index.html`、`assets/cffg/` 中已列出的脚本、样式、两段视频、海报、展示数据与来源记录，以及 `src/cffg_util_ros/README.md`。不会复制 `reports/`、原始数据、checkpoint、日志、Git 元数据或整个源码目录；实验来源记录中的路径只是文字信息，不会据此复制原始文件。发布前检查来源哈希、网页资源/锚点链接及相对路径，拒绝缺失文件、链接文件和不匹配的资源版本。复制结果均为独立普通文件。

本地验证：

```bash
python3 -m unittest discover -s src/cffg_util_ros/tests -p test_pages.py -v
python3 src/cffg_util_ros/scripts/build_pages.py --output _site
```

`_site/` 已加入 Git 忽略规则。打包程序拒绝覆盖已有目录；再次本地验证时，请指定一个新的输出目录。根目录的 `index.html` 保持不变，网页使用相对链接，适用于 GitHub 项目站点的 `/uwb_imu_is/` 路径。`.nojekyll` 仅生成在发布目录，不以跳过 Jekyll 为由上传整个仓库。

GitHub Pages 的公开性与仓库是否私有并不等价；启用前应确认上述展示文件允许公开。发布权限仅赋予部署任务，构建任务只有读取仓库的权限；两类任务均不修改远程源码。
