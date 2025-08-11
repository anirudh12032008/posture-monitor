 async function setupTensorFlow() {
            try {
                await tf.setBackend('webgl');
                console.log('TensorFlow.js using WebGL backend');
            } catch (error) {
                console.warn('WebGL backend failed, trying CPU backend:', error);
                try {
                    await tf.setBackend('cpu');
                    console.log('TensorFlow.js using CPU backend');
                } catch (cpuError) {
                    console.error('Both WebGL and CPU backends failed:', cpuError);
                }
            }
            await tf.ready();
            console.log('TensorFlow.js backend ready:', tf.getBackend());
        }
        class PostureMonitor {
            constructor() {
                this.initTensorFlow();
            }
            async initTensorFlow() {
                try {
                    await setupTensorFlow();
                    this.initializeElements();
                    this.initializeState();
                    this.setupEventListeners();
                    this.loadSettings();
                    this.startRotatingTips();
                    this.requestNotificationPermission();
                    this.updateLogList();
                    this.updateStatsDisplay();
                    await this.enumerateCameras();
                } catch (error) {
                    console.error('Failed to initialize TensorFlow:', error);
                    document.getElementById('statusIndicator').textContent = 'Status: TensorFlow Error';
                }
            }
            initializeElements() {
                this.video = document.getElementById('video');
                this.overlay = document.getElementById('overlay');
                this.ctx = this.overlay.getContext('2d');
                this.startBtn = document.getElementById('startCamera');
                this.stopBtn = document.getElementById('stopCamera');
                this.cameraSelect = document.getElementById('cameraSelect');
                this.scoreText = document.getElementById('scoreText');
                this.scoreBar = document.getElementById('scoreBar');
                this.statusIndicator = document.getElementById('statusIndicator');
                this.breakModal = document.getElementById('breakModal');
                this.settingsModal = document.getElementById('settingsModal');
                this.exerciseTimer = document.getElementById('exerciseTimer');
                this.exerciseName = document.getElementById('exerciseName');
                this.logList = document.getElementById('logList');
                this.fpsRange = document.getElementById('fpsRange');
                this.fpsVal = document.getElementById('fpsVal');
                this.todayGood = document.getElementById('todayGood');
                this.todayPoor = document.getElementById('todayPoor');
            }
            initializeState() {
                this.model = null;
                this.stream = null;
                this.monitoring = false;
                this.selectedCameraId = null;
                this.detectionInterval = 1000 / Number(this.fpsRange.value);
                this.poseHistory = [];
                this.MAX_HISTORY = 100;
                this.lastTick = performance.now();
                this.poorCooldownUntil = 0;
                this.breakInterval = null;
                this.lastTrackingTime = null; 
                this.performanceStats = {
                    avgDetectionTime: 0,
                    frameCount: 0,
                    lastFiveFrames: [],
                    adaptiveMode: true
                };
                this.stats = this.loadStats();
                this.settings = {
                    reminderCooldown: 30,
                    soundEnabled: true,
                    autoBreak: true,
                    breakInterval: 32,
                    sensitivity: 1.2,
                    threshold: 50,
                    showKeypoints: true,
                    showSkeleton: true,
                    keypointSize: 4,
                    adaptiveMode: true,
                    modelType: 'resnet50'
                };
                this.baselinePose = this.loadBaselinePose(); 
                this.fpsVal.textContent = this.fpsRange.value;
                this.exercises = [
                    { name: 'neck rolls', duration: 30 },
                    { name: 'shoulder shrugs', duration: 30 },
                    { name: 'spinal twist', duration: 30 },
                    { name: 'chin tucks', duration: 30 },
                    { name: 'deep breathing', duration: 30 },
                    { name: 'wrist curls', duration: 30}
                ];
                this.tips = [
                    'keep monitor at eye level, dont go inside it hahah',
                    'sit back use chair lumbar support or else buy it from amazon',
                    'take micro breaks every 30 mins or youll regret it :evil:',
                    'keep feet flat on floor dont twist your legs like wires',
                    'shoulders relaxed, not hunched',
                    'screen 20 to 26 inches from your eyes please'
                ];
                this.tipIndex = 0;
            }
            loadStats() {
                const saved = localStorage.getItem('postureStats');
                const today = new Date().toISOString().slice(0, 10);
                if (saved) {
                    const stats = JSON.parse(saved);
                    if (stats.date === today) {
                        return stats;
                    }
                }
                return {
                    date: today,
                    goodSeconds: 0,
                    poorSeconds: 0,
                    totalSessionSeconds: 0,
                    logs: []
                };
            }
            saveStats() {
                localStorage.setItem('postureStats', JSON.stringify(this.stats));
            }
            loadSettings() {
                const saved = localStorage.getItem('postureSettings');
                if (saved) {
                    this.settings = { ...this.settings, ...JSON.parse(saved) };
                }
                this.updateSettingsUI();
            }
            saveSettings() {
                localStorage.setItem('postureSettings', JSON.stringify(this.settings));
            }
            loadBaselinePose() {
                const saved = localStorage.getItem('postureBaseline');
                return saved ? JSON.parse(saved) : null;
            }
            saveBaselinePose(pose) {
                localStorage.setItem('postureBaseline', JSON.stringify(pose));
            }
            updateSettingsUI() {
                document.getElementById('cooldownInput').value = this.settings.reminderCooldown;
                document.getElementById('soundEnabledCheck').checked = this.settings.soundEnabled;
                document.getElementById('autoBreakCheck').checked = this.settings.autoBreak;
                document.getElementById('breakIntervalInput').value = this.settings.breakInterval;
                document.getElementById('sensitivityRange').value = this.settings.sensitivity;
                document.getElementById('sensitivityVal').textContent = this.settings.sensitivity;
                document.getElementById('thresholdInput').value = this.settings.threshold;
                document.getElementById('showKeypointsCheck').checked = this.settings.showKeypoints;
                document.getElementById('showSkeletonCheck').checked = this.settings.showSkeleton;
                document.getElementById('keypointSizeRange').value = this.settings.keypointSize;
                document.getElementById('keypointSizeVal').textContent = this.settings.keypointSize;
                document.getElementById('adaptiveModeCheck').checked = this.settings.adaptiveMode;
                document.getElementById('modelTypeSelect').value = this.settings.modelType;
            }
            setupEventListeners() {
                this.startBtn.addEventListener('click', () => this.startCamera());
                this.stopBtn.addEventListener('click', () => this.stopCamera());
                this.cameraSelect.addEventListener('change', (e) => {
                    this.selectedCameraId = e.target.value;
                    this.logActivity(`Camera switched: ${e.target.options[e.target.selectedIndex].text}`);
                });
                this.fpsRange.addEventListener('input', (e) => {
                    this.detectionInterval = 1000 / Number(e.target.value);
                    this.fpsVal.textContent = e.target.value;
                });
        document.getElementById('breakBtn').addEventListener('click', () => this.startBreak());
        document.getElementById('refreshPermissions').addEventListener('click', () => this.refreshCameraPermissions());
        document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('cancelSettings').addEventListener('click', () => this.hideSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettingsFromUI());
        document.getElementById('closeSettings').addEventListener('click', () => this.hideSettings());
        document.getElementById('resetSettingsBtn').addEventListener('click', () => this.resetSettings());
        document.getElementById('debugBtn').addEventListener('click', () => this.toggleDebug());
        
        document.getElementById('sensitivityRange').addEventListener('input', (e) => {
            document.getElementById('sensitivityVal').textContent = e.target.value;
        });
        document.getElementById('keypointSizeRange').addEventListener('input', (e) => {
            document.getElementById('keypointSizeVal').textContent = e.target.value;
        });
                this.breakModal.addEventListener('click', (e) => {
                    if (e.target === this.breakModal) this.endBreak('Break cancelled');
                });
                this.settingsModal.addEventListener('click', (e) => {
                    if (e.target === this.settingsModal) this.hideSettings();
                });
            }
            async requestNotificationPermission() {
                if ('Notification' in window && Notification.permission === 'default') {
                    await Notification.requestPermission();
                }
            }
            async enumerateCameras() {
                try {
                    await navigator.mediaDevices.getUserMedia({ video: true });
                    
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = devices.filter(device => device.kind === 'videoinput');
                    
                    this.cameraSelect.innerHTML = '<option value="" style="background-color: #1a1a2e; color: white;">Select Camera...</option>';
                    
                    if (videoDevices.length === 0) {
                        this.cameraSelect.innerHTML = '<option value="" style="background-color: #1a1a2e; color: white;">No cameras found</option>';
                        this.logActivity('No cameras detected');
                        return;
                    }
                    
                    videoDevices.forEach((device, index) => {
                        const option = document.createElement('option');
                        option.value = device.deviceId;
                        option.textContent = device.label || `Camera ${index + 1}`;
                        option.className = 'camera-option';
                        option.style.backgroundColor = '#1a1a2e';
                        option.style.color = 'white';
                        this.cameraSelect.appendChild(option);
                    });
                    
                    if (videoDevices.length > 0) {
                        this.cameraSelect.value = videoDevices[0].deviceId;
                        this.selectedCameraId = videoDevices[0].deviceId;
                    }
                    
                    this.logActivity(`Found ${videoDevices.length} camera(s)`);
                    
                } catch (error) {
                    console.error('Error enumerating cameras:', error);
                    this.cameraSelect.innerHTML = '<option value="" style="background-color: #1a1a2e; color: white;">Camera access denied</option>';
                    this.logActivity('Camera enumeration failed - permission denied');
                }
            }
            async startCamera() {
                try {
                    this.statusIndicator.textContent = 'Status: Starting Camera...';
                    this.stream = await navigator.mediaDevices.getUserMedia({ 
                        video: { 
                            width: 640, 
                            height: 480,
                            deviceId: this.selectedCameraId ? { exact: this.selectedCameraId } : undefined
                        }, 
                        audio: false 
                    });
                    this.video.srcObject = this.stream;
                    await this.video.play();
                    await new Promise(resolve => {
                        if (this.video.videoWidth > 0) {
                            resolve();
                        } else {
                            this.video.addEventListener('loadedmetadata', resolve, { once: true });
                        }
                    });
                    this.overlay.width = this.video.videoWidth || 640;
                    this.overlay.height = this.video.videoHeight || 480;
                    this.overlay.style.width = this.video.offsetWidth + 'px';
                    this.overlay.style.height = this.video.offsetHeight + 'px';
                    this.overlay.style.display = 'block';
                    this.overlay.style.position = 'absolute';
                    this.overlay.style.top = '0';
                    this.overlay.style.left = '0';
                    this.overlay.style.zIndex = '10';
                    this.overlay.style.pointerEvents = 'none';
                    console.log('Canvas setup:', {
                        width: this.overlay.width,
                        height: this.overlay.height,
                        style: this.overlay.style.cssText,
                        videoWidth: this.video.videoWidth,
                        videoHeight: this.video.videoHeight,
                        offsetWidth: this.video.offsetWidth,
                        offsetHeight: this.video.offsetHeight
                    });
          this.statusIndicator.textContent = 'Status: Loading AI Model...';
          try {
            console.log('Loading ResNet50 model (best accuracy)...');
            this.model = await posenet.load({
              architecture: 'ResNet50',
              outputStride: 32,
              inputResolution: { width: 257, height: 257 },
              quantBytes: 2
            });
            console.log('ResNet50 model loaded successfully');
          } catch (modelError) {
            console.error('ResNet50 loading failed:', modelError);
            try {
              console.log('Trying ResNet50 with alternative settings...');
              this.model = await posenet.load({
                architecture: 'ResNet50',
                outputStride: 16,
                inputResolution: { width: 513, height: 513 },
                quantBytes: 4
              });
            } catch (fallbackError) {
              try {
                this.model = await posenet.load({
                  architecture: 'MobileNetV1',
                  outputStride: 16,
                  inputResolution: { width: 513, height: 513 },
                  multiplier: 1.0
                });
              } catch (mobileError) {
                this.statusIndicator.textContent = 'Status: AI Model Error';
                return;
              }
            }
          }

          try {
            const warmupCanvas = document.createElement('canvas');
            warmupCanvas.width = 257;
            warmupCanvas.height = 257;
            const ctx = warmupCanvas.getContext('2d');
            ctx.fillStyle = 'rgb(128,128,128)';
            ctx.fillRect(0, 0, 257, 257);
            await this.model.estimateSinglePose(warmupCanvas, {
              imageScaleFactor: 0.5,
              outputStride: 32
            });
            console.log('Model warm-up complete');
          } catch (warmupError) {
            console.warn('Model warm-up failed:', warmupError);
          }
                    this.monitoring = true;
                    this.lastTrackingTime = Date.now(); 
                    this.statusIndicator.textContent = 'Status: Monitoring Active';
                    this.runDetectionLoop();
                    this.startPeriodicStatsUpdate();
                    this.logActivity('Posture monitoring started');
                } catch (err) {
                    console.error('Camera start error:', err);
                    
                    let errorMessage = 'Failed to access camera';
                    if (err.name === 'NotAllowedError') {
                        errorMessage = 'Camera permission denied';
                    } else if (err.name === 'NotFoundError') {
                        errorMessage = 'Selected camera not found';
                    } else if (err.name === 'NotReadableError') {
                        errorMessage = 'Camera is busy or unavailable';
                    } else if (err.name === 'OverconstrainedError') {
                        errorMessage = 'Camera does not support required settings';
                    }
                    
                    this.statusIndicator.textContent = `Status: Camera Error`;
                    this.logActivity(`Camera error: ${errorMessage}`);
                    this.showNotification('Camera Error', `${errorMessage}. Try selecting a different camera or refresh permissions.`);
                    
                    if (this.selectedCameraId && err.name !== 'NotAllowedError') {
                        this.logActivity('Attempting fallback to default camera...');
                        this.selectedCameraId = null;
                        this.cameraSelect.value = '';
                    }
                }
            }
            stopCamera() {
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                    this.video.srcObject = null;
                    this.stream = null;
                }
                this.monitoring = false;
                this.stopPeriodicStatsUpdate();
                this.statusIndicator.textContent = 'Status: Monitoring Stopped';
                this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
                this.logActivity('Posture monitoring stopped');
            }

            drawKeypointsAndSkeleton(pose) {
                this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
                this.ctx.lineWidth = 2;
                const keypoints = pose.keypoints.filter(k => k.score > 0.1);
                const videoWidth = this.video.videoWidth || this.video.clientWidth || 640;
                const videoHeight = this.video.videoHeight || this.video.clientHeight || 480;
                const canvasWidth = this.overlay.width;
                const canvasHeight = this.overlay.height;
                const scaleX = canvasWidth / videoWidth;
                const scaleY = canvasHeight / videoHeight;
                const adjacentPairs = posenet.getAdjacentKeyPoints(pose.keypoints, 0.1);
                this.ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                this.ctx.lineWidth = 3;
                adjacentPairs.forEach(pair => {
                    const x1 = pair[0].position.x * scaleX;
                    const y1 = pair[0].position.y * scaleY;
                    const x2 = pair[1].position.x * scaleX;
                    const y2 = pair[1].position.y * scaleY;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x1, y1);
                    this.ctx.lineTo(x2, y2);
                    this.ctx.stroke();
                });

                pose.keypoints.forEach(k => {
                    if (k.score > 0.05) { 
                        const x = k.position.x * scaleX;
                        const y = k.position.y * scaleY;
                        this.ctx.beginPath();
                        this.ctx.fillStyle = `rgba(0,255,150,${k.score})`;
                        this.ctx.arc(x, y, 5, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.fillStyle = 'white';
                        this.ctx.font = '10px Arial';
                        this.ctx.fillText(`${k.part}(${k.score.toFixed(2)})`, x + 8, y - 8);
                    }
                });

                const kp = {};
                pose.keypoints.forEach(k => kp[k.part] = k);
                this.ctx.strokeStyle = 'rgba(0,255,0,0.9)';
                this.ctx.lineWidth = 4;
                this.ctx.setLineDash([8, 8]);
                const centerX = this.overlay.width / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(centerX, 0);
                this.ctx.lineTo(centerX, this.overlay.height);
                this.ctx.stroke();
                this.ctx.setLineDash([]);

                if (kp.nose && kp.nose.score > 0.1) {
                    const headX = kp.nose.position.x * scaleX;
                    const headY = kp.nose.position.y * scaleY;
                    this.ctx.beginPath();
                    this.ctx.fillStyle = 'rgba(255,80,80,0.8)'; 
                    this.ctx.strokeStyle = 'rgba(255,255,255,0.9)'; 
                    this.ctx.lineWidth = 2;
                    this.ctx.arc(headX, headY, 12, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke()
                    this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    this.ctx.font = '11px Arial';
                    this.ctx.fillText('Head', headX + 15, headY - 10);
                }

                if (kp.leftShoulder && kp.rightShoulder && kp.leftShoulder.score > 0.1 && kp.rightShoulder.score > 0.1) {
                    const leftShoulderX = kp.leftShoulder.position.x * scaleX;
                    const leftShoulderY = kp.leftShoulder.position.y * scaleY;
                    const rightShoulderX = kp.rightShoulder.position.x * scaleX;
                    const rightShoulderY = kp.rightShoulder.position.y * scaleY;
                    this.ctx.beginPath();
                    this.ctx.fillStyle = 'rgba(80,150,255,0.8)'; 
                    this.ctx.strokeStyle = 'rgba(255,255,255,0.9)'; 
                    this.ctx.lineWidth = 2;
                    this.ctx.arc(leftShoulderX, leftShoulderY, 10, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke();
                    this.ctx.beginPath();
                    this.ctx.arc(rightShoulderX, rightShoulderY, 10, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke();
                    const shoulderMidX = (leftShoulderX + rightShoulderX) / 2;
                    const shoulderMidY = (leftShoulderY + rightShoulderY) / 2;
                    this.ctx.beginPath();
                    this.ctx.fillStyle = 'rgba(255,200,80,0.8)'; 
                    this.ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                    this.ctx.arc(shoulderMidX, shoulderMidY, 8, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke();
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = 'rgba(255,200,80,0.7)'; 
                    this.ctx.lineWidth = 3;
                    this.ctx.moveTo(leftShoulderX, leftShoulderY);
                    this.ctx.lineTo(rightShoulderX, rightShoulderY);
                    this.ctx.stroke();
                    this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    this.ctx.font = '11px Arial';
                    this.ctx.fillText('L', leftShoulderX - 15, leftShoulderY - 12);
                    this.ctx.fillText('R', rightShoulderX + 12, rightShoulderY - 12);
                }
                this.ctx.lineWidth = 2;}

      analyzePose(pose) {
        const kp = {};
        pose.keypoints.forEach(k => kp[k.part] = k);
        let score = 40;
        let debugInfo = { components: [] };
        const requiredParts = ['nose', 'leftShoulder', 'rightShoulder'];
        for (let part of requiredParts) {
          if (!kp[part] || kp[part].score < 0.2) {
            return { score: 35, category: 'Poor', reason: 'low_confidence' };
          }
        }
        const nose = kp.nose.position;
        const leftShoulder = kp.leftShoulder.position;
        const rightShoulder = kp.rightShoulder.position;
        const shoulderMid = {
          x: (leftShoulder.x + rightShoulder.x) / 2,
          y: (leftShoulder.y + rightShoulder.y) / 2
        };
        const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

        // 1. HEAD HORIZONTAL ALIGNMENT (±20 points) - Most important for ergonomics
        const headOffsetX = Math.abs(nose.x - shoulderMid.x);
        const headOffsetRatio = headOffsetX / (shoulderWidth || 100);
        let headAlignScore = 0;
        if (headOffsetRatio < 0.15) {
          headAlignScore = 20; 
          debugInfo.components.push('Perfect head alignment (+20)');
        } else if (headOffsetRatio < 0.3) {
          headAlignScore = 12; 
          debugInfo.components.push('Good head alignment (+12)');
        } else if (headOffsetRatio < 0.5) {
          headAlignScore = 5; 
          debugInfo.components.push('Fair head alignment (+5)');
        } else if (headOffsetRatio < 0.7) {
          headAlignScore = -8; 
          debugInfo.components.push('Poor head alignment (-8)');
        } else {
          headAlignScore = -20; 
          debugInfo.components.push('Very poor head alignment (-20)');
        }
        score += headAlignScore;

        // 2. FORWARD HEAD POSTURE (±20 points) - Critical for neck health
        const headVerticalOffset = nose.y - shoulderMid.y;
        const neckIdealPosition = shoulderWidth * 0.25; 
        let forwardHeadScore = 0;
        if (headVerticalOffset < -neckIdealPosition * 0.3) {
          forwardHeadScore = 20;
          debugInfo.components.push('Excellent head position (+20)');
        } else if (headVerticalOffset < neckIdealPosition * 0.3) {
          forwardHeadScore = 12; 
          debugInfo.components.push('Good head position (+12)');
        } else if (headVerticalOffset < neckIdealPosition * 1.0) {
          forwardHeadScore = 2;
          debugInfo.components.push('Slightly forward head (+2)');
        } else if (headVerticalOffset < neckIdealPosition * 2.0) {
          forwardHeadScore = -10;
          debugInfo.components.push('Forward head posture (-10)');
        } else {
          forwardHeadScore = -20; 
          debugInfo.components.push('Severe forward head (-20)');
        }
        score += forwardHeadScore;

        // 3. SHOULDER LEVEL (±15 points)
        const shoulderLevelDiff = Math.abs(leftShoulder.y - rightShoulder.y);
        let shoulderLevelScore = 0;
        if (shoulderLevelDiff < 8) {
          shoulderLevelScore = 15; 
          debugInfo.components.push('Perfect shoulder level (+15)');
        } else if (shoulderLevelDiff < 18) {
          shoulderLevelScore = 8; 
          debugInfo.components.push('Good shoulder level (+8)');
        } else if (shoulderLevelDiff < 30) {
          shoulderLevelScore = 2; 
          debugInfo.components.push('Slightly uneven shoulders (+2)');
        } else if (shoulderLevelDiff < 45) {
          shoulderLevelScore = -5; 
          debugInfo.components.push('Uneven shoulders (-5)');
        } else {
          shoulderLevelScore = -15; 
          debugInfo.components.push('Very uneven shoulders (-15)');
        }
        score += shoulderLevelScore;

        // 4. SHOULDER HEIGHT/SLOUCHING (±15 points)
        const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const relativeShoulderPosition = (nose.y - avgShoulderY) / (shoulderWidth || 100);
        let slouchScore = 0;

        if (relativeShoulderPosition > 0.9) {
          slouchScore = 15; 
          debugInfo.components.push('Excellent posture, chest up (+15)');
        } else if (relativeShoulderPosition > 0.6) {
          slouchScore = 8; 
          debugInfo.components.push('Good shoulder position (+8)');
        } else if (relativeShoulderPosition > 0.3) {
          slouchScore = 2; 
          debugInfo.components.push('Neutral shoulder position (+2)');
        } else if (relativeShoulderPosition > 0.0) {
          slouchScore = -5; 
          debugInfo.components.push('Slightly slouched (-5)');
        } else {
          slouchScore = -15; 
          debugInfo.components.push('Heavily slouched (-15)');
        }
        score += slouchScore;

 
        // 6. CONFIDENCE ADJUSTMENT (±5 points)
        const avgConfidence = pose.keypoints.reduce((sum, kp) => sum + kp.score, 0) / pose.keypoints.length;
        let confScore = 0;
        if (avgConfidence < 0.3) {
          confScore = -5; 
          debugInfo.components.push('Poor detection quality (-5)');
        } else if (avgConfidence > 0.8) {
          confScore = 5; 
          debugInfo.components.push('Excellent detection quality (+5)');
        }
        score += confScore;
        score = Math.max(30, Math.min(100, Math.round(score)));
        let category = 'Fair';
        if (score >= 85) category = 'Excellent';
        else if (score >= 70) category = 'Good';
        else if (score >= 55) category = 'Fair';
        else category = 'Poor';
        return { 
          score, 
          category, 
          debugInfo,
          details: { 
            headAlignment: Math.round(100 - (headOffsetRatio * 100)),
            forwardHead: Math.round(Math.max(0, 100 - (Math.abs(headVerticalOffset) / 50 * 100))),
            shoulderLevel: Math.round(Math.max(0, 100 - (shoulderLevelDiff / 30 * 100))),
            spinalAlignment: Math.round(Math.max(0, 100 - (Math.abs(relativeShoulderPosition) * 50))),
            confidence: Math.round(avgConfidence * 100)
          } 
        };
      }
      updateUIFromScore(result) {
        this.scoreText.textContent = `${result.score}`;
        this.scoreBar.style.width = `${result.score}%`;
        if (result.score >= 85) {
          this.scoreBar.style.background = 'linear-gradient(90deg, rgba(16,185,129,0.9), rgba(5,150,105,0.9))';
          this.statusIndicator.textContent = 'Status: Excellent Posture';
        } else if (result.score >= 70) {
          this.scoreBar.style.background = 'linear-gradient(90deg, rgba(34,197,94,0.9), rgba(16,185,129,0.9))';
          this.statusIndicator.textContent = 'Status: Good Posture';
        } else if (result.score >= 55) {
          this.scoreBar.style.background = 'linear-gradient(90deg, rgba(234,179,8,0.9), rgba(250,204,21,0.9))';
          this.statusIndicator.textContent = 'Status: Fair Posture';
        } else {
          this.scoreBar.style.background = 'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))';
          this.statusIndicator.textContent = 'Status: Poor Posture';
        }
        if (this.debugPanel && this.debugPanel.style.display !== 'none') {
          this.updateDebugPanel(result);
        }
      }
            async runDetectionLoop() {
                if (this.video.paused || this.video.ended || !this.model || !this.monitoring) return;
                if (this.video.readyState < 2) { 
                    setTimeout(() => this.runDetectionLoop(), 100);
                    return;
                }
                const now = performance.now();
                if (now - this.lastTick < this.detectionInterval) {
                    setTimeout(() => this.runDetectionLoop(), 16);
                    return;
                }
                this.lastTick = now;
                try {
                    console.log('Video element state:', {
                        videoWidth: this.video.videoWidth,
                        videoHeight: this.video.videoHeight,
                        clientWidth: this.video.clientWidth,
                        clientHeight: this.video.clientHeight,
                        readyState: this.video.readyState,
                        paused: this.video.paused,
                        ended: this.video.ended
                    });
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCanvas.width = this.video.videoWidth || 640;
                    tempCanvas.height = this.video.videoHeight || 480;
                    tempCtx.drawImage(this.video, 0, 0, tempCanvas.width, tempCanvas.height);
                    console.log('Using temp canvas for pose estimation:', {
                        width: tempCanvas.width,
                        height: tempCanvas.height
                    });
                    let pose;
                    try {
                        console.log('Running pose estimation with ResNet50 optimal settings...');
                        pose = await this.model.estimateSinglePose(tempCanvas, {
                            flipHorizontal: false,
                            imageScaleFactor: 0.7, 
                            outputStride: 32, 
                            maxDetections: 1,
                            scoreThreshold: 0.2, 
                            nmsRadius: 20
                        });
                    } catch (poseError) {
                        console.error('ResNet50 pose estimation failed, trying standard settings:', poseError);
                        try {
                            pose = await this.model.estimateSinglePose(tempCanvas, {
                                flipHorizontal: false,
                                imageScaleFactor: 0.5,
                                outputStride: 16
                            });
                        } catch (fallbackError) {
                            console.error('Standard pose estimation failed, trying minimal:', fallbackError);
                            pose = await this.model.estimateSinglePose(tempCanvas);
                        }
                    }
                    console.log('Raw pose data:', pose);
                    console.log('First 3 keypoints raw data:', pose.keypoints.slice(0, 3));
                    const validKeypoints = pose.keypoints.filter(kp => 
                        kp.position && 
                        typeof kp.position.x === 'number' && 
                        typeof kp.position.y === 'number' &&
                        !isNaN(kp.position.x) && 
                        !isNaN(kp.position.y) &&
                        kp.position.x !== 0 && 
                        kp.position.y !== 0
                    );
                    console.log('Valid positioned keypoints:', validKeypoints.length);
                    if (validKeypoints.length > 0) {
                        console.log('Sample valid keypoint:', validKeypoints[0]);
                    } else {
                        console.warn('NO VALID KEYPOINTS FOUND - all coordinates are 0,0 or invalid');
                        try {
                            console.log('Trying fallback pose estimation...');
                            pose = await this.model.estimateSinglePose(tempCanvas);
                            console.log('Fallback pose result:', pose.keypoints.slice(0, 3));
                        } catch (fallbackError) {
                            console.error('All pose estimation methods failed:', fallbackError);
                        }}
                    this.poseHistory.push({ t: Date.now(), pose });
                    if (this.poseHistory.length > this.MAX_HISTORY) this.poseHistory.shift();
          this.drawKeypointsAndSkeleton(pose);
          const result = this.analyzePose(pose);
          this.updateUIFromScore(result);
          this.updateDebugInfo(result);
          if (!this.lastTrackingTime) {
              this.lastTrackingTime = Date.now();
          }
          const now = Date.now();
          if (now - this.lastTrackingTime >= 1000) {
              if (result.score > 60) {
                  this.stats.goodSeconds += 1;
              } else {
                  this.stats.poorSeconds += 1;
              }
              this.lastTrackingTime = now;
              this.updateStatsDisplay();
              this.saveStats();
          }
          if (result.score < 55 && Date.now() > this.poorCooldownUntil) {
              this.poorCooldownUntil = Date.now() + (this.settings.reminderCooldown * 1000);
              this.showNotification('Posture Reminder', 'Poor posture detected - try adjusting your position');
              this.logActivity(`Poor posture detected (${result.score})`);
          }
                } catch (error) {
                    console.error('Pose detection error:', error);
                }
                requestAnimationFrame(() => this.runDetectionLoop());
            }
            updateLogList() {
                this.logList.innerHTML = '';
                
                if (!this.stats.logs || this.stats.logs.length === 0) {
                    const item = document.createElement('li');
                    item.className = 'p-2 text-xs opacity-60 text-center';
                    item.textContent = 'No activity logged yet...';
                    this.logList.appendChild(item);
                    return;
                }
                
                this.stats.logs.slice(0, 50).forEach(entry => {
                    if (!entry || !entry.msg || !entry.t) {
                        return;
                    }
                    
                    const item = document.createElement('li');
                    item.className = 'p-2 glass text-xs rounded-md border border-cyan-500/20';
                    item.textContent = `${new Date(entry.t).toLocaleTimeString()}: ${entry.msg}`;
                    this.logList.appendChild(item);
                });
                
                if (this.logList.children.length === 0) {
                    const item = document.createElement('li');
                    item.className = 'p-2 text-xs opacity-60 text-center';
                    item.textContent = 'No valid activity logs found...';
                    this.logList.appendChild(item);
                }
            }
            updateStatsDisplay() {
                const formatTime = (seconds) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    if (mins > 0) {
                        return `${mins}m ${secs}s`;
                    } else {
                        return `${secs}s`;
                    }
                };
                this.todayGood.textContent = formatTime(this.stats.goodSeconds);
                this.todayPoor.textContent = formatTime(this.stats.poorSeconds);
            }
            logActivity(message) {
                if (!message || typeof message !== 'string' || message.trim() === '') {
                    return;
                }
                
                const entry = { 
                    t: Date.now(), 
                    msg: message.trim() 
                };
                
                if (!this.stats.logs) {
                    this.stats.logs = [];
                }
                
                this.stats.logs.unshift(entry);
                if (this.stats.logs.length > 1000) {
                    this.stats.logs = this.stats.logs.slice(0, 1000);
                }
                
                this.updateLogList();
            }
            showNotification(title, body) {
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(title, { body, icon: '🧘‍♂️' });
                }
                const notification = document.createElement('div');
                notification.className = 'notification';
                notification.innerHTML = `<strong>${title}</strong><br>${body}`;
                document.body.appendChild(notification);
                setTimeout(() => {
                    notification.remove();}, 4000);
                if (this.settings.soundEnabled) {
                    this.playNotificationSound();}}
            playNotificationSound() {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.5);
            }
            startBreak() {
                const exercise = this.exercises[Math.floor(Math.random() * this.exercises.length)];
                this.exerciseName.textContent = exercise.name;
                let timeLeft = exercise.duration;
                this.exerciseTimer.textContent = timeLeft;
                this.breakModal.classList.remove('hidden');
                this.breakModal.classList.add('flex');
                this.breakInterval = setInterval(() => {
                    timeLeft--;
                    this.exerciseTimer.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        this.endBreak(`Break completed: ${exercise.name}`);
                    }
                }, 1000);
                document.getElementById('skipExercise').onclick = () => {
                    this.endBreak(`Break skipped: ${exercise.name}`);
                };
                document.getElementById('completeExercise').onclick = () => {
                    this.endBreak(`Break completed (manual): ${exercise.name}`);
                };
            }
            endBreak(message) {
                if (this.breakInterval) {
                    clearInterval(this.breakInterval);
                    this.breakInterval = null;
                }
                this.breakModal.classList.add('hidden');
                this.breakModal.classList.remove('flex');
                this.logActivity(message);
                this.showNotification('Break Complete', 'Great job taking a break!');
            }
            calibrate() {
                if (this.poseHistory.length > 0) {
                    const lastPose = this.poseHistory[this.poseHistory.length - 1].pose;
                    this.saveBaselinePose(lastPose);
                    this.baselinePose = lastPose;
                    this.logActivity('Baseline posture calibrated');
                    this.showNotification('Calibration Complete', 'Posture baseline saved. Your score will now be relative to this position.');
                } else {
                    this.showNotification('Calibration Failed', 'No pose data available. Start monitoring first.');
                }
            }
            clearLogs() {
                this.stats.logs = [];
                this.saveStats();
                this.updateLogList();
            }
            showSettings() {
                this.updateSettingsUI();
                this.settingsModal.classList.remove('hidden');
                this.settingsModal.classList.add('flex');
            }
            hideSettings() {
                this.settingsModal.classList.add('hidden');
                this.settingsModal.classList.remove('flex');
            }
            saveSettingsFromUI() {
                this.settings.reminderCooldown = parseInt(document.getElementById('cooldownInput').value) || 30;
                this.settings.soundEnabled = document.getElementById('soundEnabledCheck').checked;
                this.settings.autoBreak = document.getElementById('autoBreakCheck').checked;
                this.settings.breakInterval = parseInt(document.getElementById('breakIntervalInput').value) || 30;
                this.settings.sensitivity = parseFloat(document.getElementById('sensitivityRange').value) || 1.0;
                this.settings.threshold = parseInt(document.getElementById('thresholdInput').value) || 50;
                this.settings.showKeypoints = document.getElementById('showKeypointsCheck').checked;
                this.settings.showSkeleton = document.getElementById('showSkeletonCheck').checked;
                this.settings.keypointSize = parseInt(document.getElementById('keypointSizeRange').value) || 4;
                this.settings.adaptiveMode = document.getElementById('adaptiveModeCheck').checked;
                this.settings.modelType = document.getElementById('modelTypeSelect').value;
                
                this.saveSettings();
                this.hideSettings();
                this.logActivity('Settings updated successfully');
                this.showNotification('Settings saved!', 'success');
            }
      startRotatingTips() {
        setInterval(() => {
          document.getElementById('rotatingTip').textContent = this.tips[this.tipIndex];
          this.tipIndex = (this.tipIndex + 1) % this.tips.length;
        }, 8000);
      }
      toggleDebug() {
        const debugPanel = document.getElementById('debugPanel');
        if (debugPanel.classList.contains('hidden')) {
          debugPanel.classList.remove('hidden');
        } else {
          debugPanel.classList.add('hidden');
        }
      }
      updateDebugPanel(result) {
        const debugInfo = document.getElementById('debugInfo');
        if (!debugInfo || debugInfo.parentElement.classList.contains('hidden')) return;
        let componentBreakdown = '';
        if (result.debugInfo && result.debugInfo.components) {
          componentBreakdown = result.debugInfo.components.map(comp => `• ${comp}`).join('<br>');
        } 
        debugInfo.innerHTML = `
          <strong>Final Score: ${result.score}/100</strong><br>
          <strong>Category: ${result.category}</strong><br><br>
          <strong>Score Breakdown:</strong><br>
          ${componentBreakdown || 'No breakdown available'}<br><br>
          <strong>Detection Quality:</strong><br>
          • Confidence: ${result.details.confidence}%<br>
          • Head Alignment: ${result.details.headAlignment}%<br>
          • Forward Head: ${result.details.forwardHead}%<br>
          • Shoulder Level: ${result.details.shoulderLevel}%<br>
          • Spinal Alignment: ${result.details.spinalAlignment}%
        `;
      }
      updateDebugInfo(result) {
        this.updateDebugPanel(result);
      }
      updatePerformanceStats(detectionTime) {
                this.performanceStats.frameCount++;
                this.performanceStats.lastFiveFrames.push(detectionTime);
                
                if (this.performanceStats.lastFiveFrames.length > 5) {
                    this.performanceStats.lastFiveFrames.shift();
                }
                
                this.performanceStats.avgDetectionTime = 
                    this.performanceStats.lastFiveFrames.reduce((a, b) => a + b, 0) / 
                    this.performanceStats.lastFiveFrames.length;
                
                if (this.performanceStats.frameCount % 30 === 0) {
                    console.log('Performance stats:', {
                        avgDetectionTime: this.performanceStats.avgDetectionTime.toFixed(1) + 'ms',
                        frameCount: this.performanceStats.frameCount,
                        targetFPS: this.fpsRange.value
                    });
                }
            }
            startPeriodicStatsUpdate() {
                if (this.statsUpdateInterval) {
                    clearInterval(this.statsUpdateInterval);
                }
                this.statsUpdateInterval = setInterval(() => {
                    if (this.monitoring) {
                        this.updateStatsDisplay();
                    }
                }, 5000);
            }
            stopPeriodicStatsUpdate() {
                if (this.statsUpdateInterval) {
                    clearInterval(this.statsUpdateInterval);
                    this.statsUpdateInterval = null;
                }
            }
        }
        document.addEventListener('DOMContentLoaded', () => {
            new PostureMonitor();
        });