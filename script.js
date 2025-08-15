async function setupTensorFlow() {
    try {
        await tf.setBackend('webgl');
    } catch (error) {
        console.warn('WebGL backend failed, trying CPU backend:', error);
        try {
            await tf.setBackend('cpu');
        } catch (cpuError) {
            console.error('Both WebGL and CPU backends failed:', cpuError);
        }
    }
    await tf.ready();
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
        this.frameIntervalRange = document.getElementById('frameIntervalRange');
        this.frameIntervalVal = document.getElementById('frameIntervalVal');
        this.todayGood = document.getElementById('todayGood');
        this.todayPoor = document.getElementById('todayPoor');
        this.achievementsBtn = document.getElementById('achievementsBtn');
        this.achievementsModal = document.getElementById('achievementsModal');
        this.closeAchievements = document.getElementById('closeAchievements');
        this.exportDataBtn = document.getElementById('exportDataBtn');
        this.exportModal = document.getElementById('exportModal');
        this.closeExport = document.getElementById('closeExport');
        
        this.performanceToggle = document.getElementById('performanceToggle');
        this.performanceWidget = document.getElementById('performanceWidget');
        this.closePerformance = document.getElementById('closePerformance');
        this.realTimeFPS = document.getElementById('realTimeFPS');
        this.avgDetectionTime = document.getElementById('avgDetectionTime');
        this.autoAdjustStatus = document.getElementById('autoAdjustStatus');
        this.performanceStatus = document.getElementById('performanceStatus');
        
        this.exportBtn = document.getElementById('exportBtn');
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
        this.tempCanvas = document.createElement('canvas');
        this.tempCtx = this.tempCanvas.getContext('2d');
        this.performanceStats = {
            avgDetectionTime: 0,
            frameCount: 0,
            lastFiveFrames: [],
            adaptiveMode: true,
            realTimeFPS: 0,
            fpsCounter: 0,
            lastFPSTime: performance.now(),
            autoAdjustEnabled: false
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
            modelType: 'resnet50',
            frameProcessInterval: 5  
        };
        this.lastFrameProcessTime = 0; 
        this.lastPose = null; 
        this.baselinePose = this.loadBaselinePose();
        this.fpsVal.textContent = this.fpsRange.value;
        this.frameIntervalVal.textContent = this.settings.frameProcessInterval.toFixed(1);
        this.exercises = [
            { name: 'neck rolls', duration: 30 },
            { name: 'shoulder shrugs', duration: 30 },
            { name: 'spinal twist', duration: 30 },
            { name: 'chin tucks', duration: 30 },
            { name: 'deep breathing', duration: 30 },
            { name: 'wrist curls', duration: 30 }
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
        this.achievements = this.loadAchievements();
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
    loadAchievements() {
        const saved = localStorage.getItem('postureAchievements');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            firstSession: { unlocked: false, unlockedAt: null },
            earlyBird: { unlocked: false, unlockedAt: null },
            perfectPosture: { unlocked: false, unlockedAt: null },
            streakMaster: { unlocked: false, unlockedAt: null },
            breakMaster: { unlocked: false, unlockedAt: null, progress: 0 },
            wellnessChampion: { unlocked: false, unlockedAt: null, progress: 0 }
        };
    }
    saveAchievements() {
        localStorage.setItem('postureAchievements', JSON.stringify(this.achievements));
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
        document.getElementById('showVisualPointers').checked = this.settings.showKeypoints;
        document.getElementById('showSkeletonCheck').checked = this.settings.showSkeleton;
        document.getElementById('keypointSizeRange').value = this.settings.keypointSize;
        document.getElementById('keypointSizeVal').textContent = this.settings.keypointSize;
        document.getElementById('adaptiveModeCheck').checked = this.settings.adaptiveMode;
        document.getElementById('modelTypeSelect').value = this.settings.modelType;
        this.frameIntervalRange.value = this.settings.frameProcessInterval;
        this.frameIntervalVal.textContent = this.settings.frameProcessInterval.toFixed(1);
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
        this.frameIntervalRange.addEventListener('input', (e) => {
            this.settings.frameProcessInterval = Number(e.target.value);
            this.frameIntervalVal.textContent = Number(e.target.value).toFixed(1);
            this.saveSettings();
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
        if (this.achievementsBtn) {
            this.achievementsBtn.addEventListener('click', () => this.showAchievements());
        }
        if (this.closeAchievements) {
            this.closeAchievements.addEventListener('click', () => this.hideAchievements());
        }
        if (this.exportDataBtn) {
            this.exportDataBtn.addEventListener('click', () => this.showExportModal());
        }
        if (this.closeExport) {
            this.closeExport.addEventListener('click', () => this.hideExportModal());
        }
        document.getElementById('sensitivityRange').addEventListener('input', (e) => {
            document.getElementById('sensitivityVal').textContent = e.target.value;
        });
        document.getElementById('keypointSizeRange').addEventListener('input', (e) => {
            document.getElementById('keypointSizeVal').textContent = e.target.value;
        });
        
        document.getElementById('showKeypointsCheck').addEventListener('change', (e) => {
            this.settings.showKeypoints = e.target.checked;
            document.getElementById('showVisualPointers').checked = e.target.checked;
            this.saveSettings();
        });
        
        document.getElementById('showVisualPointers').addEventListener('change', (e) => {
            this.settings.showKeypoints = e.target.checked;
            document.getElementById('showKeypointsCheck').checked = e.target.checked;
            this.saveSettings();
        });
        
        this.breakModal.addEventListener('click', (e) => {
            if (e.target === this.breakModal) this.endBreak('Break cancelled');
        });
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.hideSettings();
        });
        
        if (this.performanceToggle) {
            this.performanceToggle.addEventListener('click', () => this.togglePerformanceWidget());
        }
        if (this.closePerformance) {
            this.closePerformance.addEventListener('click', () => this.hidePerformanceWidget());
        }
        
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.showExportModal());
        }
        
        const cancelExportBtn = document.getElementById('cancelExport');
        const downloadExportBtn = document.getElementById('downloadExport');
        
        if (cancelExportBtn) {
            cancelExportBtn.addEventListener('click', () => this.hideExportModal());
        }
        if (downloadExportBtn) {
            downloadExportBtn.addEventListener('click', () => this.downloadExportData());
        }
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
                this.cameraSelect.innerHTML = '<option value="" style="background-color: #1a2a2e; color: white;">No cameras found</option>';
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
            this.statusIndicator.textContent = 'Status: Loading AI Model...';
            try {
                this.model = await posenet.load({
                    architecture: 'ResNet50',
                    outputStride: 32,
                    inputResolution: { width: 257, height: 257 },
                    quantBytes: 2
                });
            } catch (modelError) {
                console.error('ResNet50 loading failed:', modelError);
                try {
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
            } catch (warmupError) {
            }
            this.monitoring = true;
            this.lastTrackingTime = Date.now();
            this.statusIndicator.textContent = 'Status: Monitoring Active';
            this.runDetectionLoop();
            this.startPeriodicStatsUpdate();
            this.logActivity('Posture monitoring started');
            this.checkAchievements();
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
        
        if (!this.settings.showKeypoints) {
            return;
        }
        
        this.ctx.lineWidth = 2;
        const keypoints = pose.keypoints.filter(k => k.score > 0.1);
        const videoWidth = this.video.videoWidth || this.video.clientWidth || 640;
        const videoHeight = this.video.videoHeight || this.video.clientHeight || 480;
        const canvasWidth = this.overlay.width;
        const canvasHeight = this.overlay.height;
        const scaleX = canvasWidth / videoWidth;
        const scaleY = canvasHeight / videoHeight;
        
        if (this.settings.showSkeleton) {
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
        }
        
        pose.keypoints.forEach(k => {
            if (k.score > 0.05) {
                const x = k.position.x * scaleX;
                const y = k.position.y * scaleY;
                this.ctx.beginPath();
                this.ctx.fillStyle = `rgba(0,255,150,${k.score})`;
                this.ctx.arc(x, y, this.settings.keypointSize || 5, 0, Math.PI * 2);
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
        
        this.ctx.lineWidth = 2;
    }
    analyzePose(pose) {
        const kp = {};
        pose.keypoints.forEach(k => kp[k.part] = k);
        
        let score = 55;
        let debugInfo = { components: [] };
        
        const requiredParts = ['nose', 'leftShoulder', 'rightShoulder'];
        for (let part of requiredParts) {
            if (!kp[part] || kp[part].score < 0.25) {
                return { score: 25, category: 'Poor', reason: 'low_confidence' };
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
        const headOffsetX = Math.abs(nose.x - shoulderMid.x);
        const headOffsetRatio = headOffsetX / (shoulderWidth || 120);
        
        let headAlignScore = 0;
        if (headOffsetRatio < 0.08) {
            headAlignScore = 25;
            debugInfo.components.push('Perfect head alignment (+25)');
        } else if (headOffsetRatio < 0.18) {
            headAlignScore = 18;
            debugInfo.components.push('Excellent head alignment (+18)');
        } else if (headOffsetRatio < 0.35) {
            headAlignScore = 10;
            debugInfo.components.push('Good head alignment (+10)');
        } else if (headOffsetRatio < 0.50) {
            headAlignScore = 3;
            debugInfo.components.push('Fair head alignment (+3)');
        } else if (headOffsetRatio < 0.70) {
            headAlignScore = -8;
            debugInfo.components.push('Poor head alignment (-8)');
        } else {
            headAlignScore = -20;
            debugInfo.components.push('Very poor head alignment (-20)');
        }
        score += headAlignScore;
        
        const headVerticalOffset = Math.abs(nose.y - shoulderMid.y);
        const referenceDistance = shoulderWidth * 0.35; 
        let forwardHeadScore = 0;
        
        if (headVerticalOffset < referenceDistance * 0.4) {
            forwardHeadScore = 25;
            debugInfo.components.push('Excellent head position (+25)');
        } else if (headVerticalOffset < referenceDistance * 0.8) {
            forwardHeadScore = 15;
            debugInfo.components.push('Good head position (+15)');
        } else if (headVerticalOffset < referenceDistance * 1.2) {
            forwardHeadScore = 5;
            debugInfo.components.push('Slight forward head (+5)');
        } else if (headVerticalOffset < referenceDistance * 1.8) {
            forwardHeadScore = -10;
            debugInfo.components.push('Forward head posture (-10)');
        } else {
            forwardHeadScore = -25;
            debugInfo.components.push('Severe forward head (-25)');
        }
        score += forwardHeadScore;
        
        const shoulderLevelDiff = Math.abs(leftShoulder.y - rightShoulder.y);
        let shoulderLevelScore = 0;
        
        if (shoulderLevelDiff < 6) {
            shoulderLevelScore = 20;
            debugInfo.components.push('Perfect shoulder level (+20)');
        } else if (shoulderLevelDiff < 15) {
            shoulderLevelScore = 12;
            debugInfo.components.push('Good shoulder level (+12)');
        } else if (shoulderLevelDiff < 25) {
            shoulderLevelScore = 5;
            debugInfo.components.push('Slight shoulder tilt (+5)');
        } else if (shoulderLevelDiff < 40) {
            shoulderLevelScore = -8;
            debugInfo.components.push('Uneven shoulders (-8)');
        } else {
            shoulderLevelScore = -20;
            debugInfo.components.push('Very uneven shoulders (-20)');
        }
        score += shoulderLevelScore;
        
        const neckLength = Math.abs(nose.y - shoulderMid.y);
        const uprightRatio = neckLength / (shoulderWidth || 120);
        let postureScore = 0;
        
        if (uprightRatio > 0.8) {
            postureScore = 20;
            debugInfo.components.push('Excellent upright posture (+20)');
        } else if (uprightRatio > 0.6) {
            postureScore = 12;
            debugInfo.components.push('Good upright posture (+12)');
        } else if (uprightRatio > 0.4) {
            postureScore = 5;
            debugInfo.components.push('Neutral posture (+5)');
        } else if (uprightRatio > 0.25) {
            postureScore = -8;
            debugInfo.components.push('Slightly slouched (-8)');
        } else {
            postureScore = -20;
            debugInfo.components.push('Poor slouched posture (-20)');
        }
        score += postureScore;
        
        let shoulderAngleScore = 0;
        if (kp.leftElbow && kp.rightElbow && kp.leftElbow.score > 0.3 && kp.rightElbow.score > 0.3) {
            const leftElbow = kp.leftElbow.position;
            const rightElbow = kp.rightElbow.position;
            
            const leftElbowBehind = leftElbow.x > leftShoulder.x;
            const rightElbowBehind = rightElbow.x < rightShoulder.x;
            
            if (leftElbowBehind && rightElbowBehind) {
                shoulderAngleScore = 15;
                debugInfo.components.push('Excellent shoulder position (+15)');
            } else if (leftElbowBehind || rightElbowBehind) {
                shoulderAngleScore = 8;
                debugInfo.components.push('Good shoulder position (+8)');
            } else {
                shoulderAngleScore = -10;
                debugInfo.components.push('Rounded shoulders (-10)');
            }
        } else {
            shoulderAngleScore = 0;
            debugInfo.components.push('Shoulder angle not detectable (0)');
        }
        score += shoulderAngleScore;
        
        const avgConfidence = pose.keypoints.reduce((sum, kp) => sum + kp.score, 0) / pose.keypoints.length;
        let confScore = 0;
        if (avgConfidence < 0.4) {
            confScore = -5;
            debugInfo.components.push('Poor detection quality (-5)');
        } else if (avgConfidence > 0.85) {
            confScore = 5;
            debugInfo.components.push('Excellent detection quality (+5)');
        } else if (avgConfidence > 0.65) {
            confScore = 2;
            debugInfo.components.push('Good detection quality (+2)');
        }
        score += confScore;
        
        score = Math.max(20, Math.min(100, Math.round(score)));
        
        let category = 'Fair';
        if (score >= 88) category = 'Excellent';
        else if (score >= 75) category = 'Good';
        else if (score >= 60) category = 'Fair';
        else category = 'Poor';
        
        return {
            score,
            category,
            debugInfo,
            details: {
                headAlignment: Math.round(Math.max(0, 100 - (headOffsetRatio * 150))),
                forwardHead: Math.round(Math.max(0, 100 - (headVerticalOffset / referenceDistance * 60))),
                shoulderLevel: Math.round(Math.max(0, 100 - (shoulderLevelDiff / 40 * 100))),
                shoulderPosture: Math.round(Math.max(0, uprightRatio * 100)),
                confidence: Math.round(avgConfidence * 100)
            }
        };
    }
    updateUIFromScore(result) {
        this.scoreText.textContent = `${result.score}`;
        this.scoreBar.style.width = `${result.score}%`;
        if (result.score >= 88) {
            this.scoreBar.style.background = 'linear-gradient(90deg, rgba(16,185,129,0.9), rgba(5,150,105,0.9))';
            this.statusIndicator.textContent = 'Status: Excellent Posture';
        } else if (result.score >= 75) {
            this.scoreBar.style.background = 'linear-gradient(90deg, rgba(34,197,94,0.9), rgba(16,185,129,0.9))';
            this.statusIndicator.textContent = 'Status: Good Posture';
        } else if (result.score >= 60) {
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
        
        const currentTime = Date.now();
        const frameProcessIntervalMs = this.settings.frameProcessInterval * 1000;
        const shouldProcessFrame = (currentTime - this.lastFrameProcessTime) >= frameProcessIntervalMs;
        
        try {
            const videoWidth = this.video.videoWidth || 640;
            const videoHeight = this.video.videoHeight || 480;
            if (this.tempCanvas.width !== videoWidth || this.tempCanvas.height !== videoHeight) {
                this.tempCanvas.width = videoWidth;
                this.tempCanvas.height = videoHeight;
            }
            
            let pose = this.lastPose;
            if (shouldProcessFrame) {
                this.lastFrameProcessTime = currentTime;
                
                const detectionStart = performance.now();
                
                this.tempCtx.drawImage(this.video, 0, 0, videoWidth, videoHeight);
                
                try {
                    pose = await this.model.estimateSinglePose(this.tempCanvas, {
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
                        pose = await this.model.estimateSinglePose(this.tempCanvas, {
                            flipHorizontal: false,
                            imageScaleFactor: 0.5,
                            outputStride: 16
                        });
                    } catch (fallbackError) {
                        console.error('Standard pose estimation failed, trying minimal:', fallbackError);
                        pose = await this.model.estimateSinglePose(this.tempCanvas);
                    }
                }
                
                const detectionEnd = performance.now();
                const detectionTime = detectionEnd - detectionStart;
                this.updatePerformanceStats(detectionTime);
                
                const validKeypoints = pose.keypoints.filter(kp =>
                    kp.position &&
                    typeof kp.position.x === 'number' &&
                    typeof kp.position.y === 'number' &&
                    !isNaN(kp.position.x) &&
                    !isNaN(kp.position.y) &&
                    kp.position.x !== 0 &&
                    kp.position.y !== 0
                );
                
                if (validKeypoints.length === 0) {
                    if (Math.random() < 0.01) {
                        console.warn('NO VALID KEYPOINTS FOUND - all coordinates are 0,0 or invalid');
                    }
                    try {
                        pose = await this.model.estimateSinglePose(this.tempCanvas);
                    } catch (fallbackError) {
                        console.error('All pose estimation methods failed:', fallbackError);
                    }
                }
                
                this.lastPose = pose;
                this.poseHistory.push({ t: Date.now(), pose });
                if (this.poseHistory.length > this.MAX_HISTORY) this.poseHistory.shift();
            }
            
            if (pose) {
                this.drawKeypointsAndSkeleton(pose);
                const result = this.analyzePose(pose);
                this.updateUIFromScore(result);
                this.updateDebugInfo(result);
                
                if (!this.lastTrackingTime) {
                    this.lastTrackingTime = Date.now();
                }
                const now = Date.now();
                if (now - this.lastTrackingTime >= 1000) {
                    if (result.score >= 70) {
                        this.stats.goodSeconds += 1;
                    } else {
                        this.stats.poorSeconds += 1;
                    }
                    this.lastTrackingTime = now;
                    this.updateStatsDisplay();
                    this.saveStats();
                    this.checkAchievements();
                }
                if (result.score < 60 && Date.now() > this.poorCooldownUntil) {
                    this.poorCooldownUntil = Date.now() + (this.settings.reminderCooldown * 1000);
                    this.showNotification('Posture Reminder', 'Poor posture detected - try adjusting your position');
                    this.logActivity(`Poor posture detected (${result.score})`);
                }
            }
        } catch (error) {
            console.error('Pose detection error:', error);
        }
        
        this.updateFPSTracking();
        
        this.updatePerformanceWidget();
        
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
            new Notification(title, { body, icon: '/favicon.ico' });
        }
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `<strong>${title}</strong><br>${body}`;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 4000);
        if (this.settings.soundEnabled) {
            this.playNotificationSound();
        }
    }
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
        if (message.includes('completed')) {
            this.achievements.breakMaster.progress = (this.achievements.breakMaster.progress || 0) + 1;
            this.saveAchievements();
        }
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
          ${componentBreakdown || 'No detailed breakdown available'}<br><br>
          <strong>Detection Quality:</strong><br>
          • Confidence: ${result.details.confidence}%<br>
          • Head Alignment: ${result.details.headAlignment}%<br>
          • Forward Head: ${result.details.forwardHead}%<br>
          • Shoulder Level: ${result.details.shoulderLevel}%<br>
          • Shoulder Posture: ${result.details.shoulderPosture}%
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
    checkAchievements() {
        if (!this.achievements) {
            return;
        }
        const now = new Date();
        let newAchievements = [];
        if (!this.achievements.firstSession.unlocked && this.monitoring) {
            this.unlockAchievement('firstSession', 'First Session - Complete your first monitoring session!');
            newAchievements.push('firstSession');
        }
        if (!this.achievements.earlyBird.unlocked && this.monitoring && now.getHours() < 9) {
            this.unlockAchievement('earlyBird', 'Early Bird - Start monitoring before 9 AM!');
            newAchievements.push('earlyBird');
        }
        if (!this.achievements.perfectPosture.unlocked && this.poseHistory) {
            const recentScores = this.poseHistory.slice(-3000);
            if (recentScores.length >= 3000) {
                const avgScore = recentScores.reduce((sum, entry) => sum + (entry.score || 0), 0) / recentScores.length;
                if (avgScore >= 85) {
                    this.unlockAchievement('perfectPosture', 'Perfect Posture - Maintain 90%+ score for 50 minutes!');
                    newAchievements.push('perfectPosture');
                }
            }
        }
        if (!this.achievements.breakMaster.unlocked) {
            if (this.achievements.breakMaster.progress >= 3) {
                this.unlockAchievement('breakMaster', 'Break Master - Complete 3 exercise breaks!');
                newAchievements.push('breakMaster');
            }
        }
        if (!this.achievements.streakMaster.unlocked) {
            const streak = this.calculatePostureStreak();
            if (streak >= 7) {
                this.unlockAchievement('streakMaster', 'Streak Master - 7-day good posture streak!');
                newAchievements.push('streakMaster');
            }
        }
        if (!this.achievements.wellnessChampion.unlocked) {
            this.achievements.wellnessChampion.progress = Math.max(this.achievements.wellnessChampion.progress, this.calculateUsageStreak());
            if (this.achievements.wellnessChampion.progress >= 30) {
                this.unlockAchievement('wellnessChampion', 'Wellness Champion - Use app for 30 consecutive days!');
                newAchievements.push('wellnessChampion');
            }
        }
        if (newAchievements.length > 0) {
            this.saveAchievements();
            this.updateAchievementDisplay();
        }
    }
    unlockAchievement(achievementId, message) {
        console.log(`Unlocking achievement: ${achievementId} - ${message}`);
        this.achievements[achievementId].unlocked = true;
        this.achievements[achievementId].unlockedAt = new Date().toISOString();
        this.showNotification('Achievement Unlocked!', message);
        this.logActivity(`Achievement unlocked: ${achievementId}`);
    }
    calculatePostureStreak() {
        const totalSeconds = this.stats.goodSeconds + this.stats.poorSeconds;
        if (totalSeconds === 0) return 0;
        const goodPercentage = (this.stats.goodSeconds / totalSeconds) * 100;
        return goodPercentage > 70 ? 1 : 0;
    }
    calculateUsageStreak() {
        const today = new Date();
        const firstUse = localStorage.getItem('firstUseDate');
        if (!firstUse) {
            localStorage.setItem('firstUseDate', today.toISOString().slice(0, 10));
            return 1;
        }
        const daysDiff = Math.floor((today - new Date(firstUse)) / (1000 * 60 * 60 * 24)) + 1;
        return Math.min(daysDiff, 30);
    }
    showAchievements() {
        this.updateAchievementDisplay();
        if (this.achievementsModal) {
            this.achievementsModal.classList.remove('hidden');
            this.achievementsModal.classList.add('flex');
        }
    }
    hideAchievements() {
        if (this.achievementsModal) {
            this.achievementsModal.classList.add('hidden');
            this.achievementsModal.classList.remove('flex');
        }
    }
    updateAchievementDisplay() {
        const achievements = [
            { id: 'firstSession', name: 'First Session', desc: 'Complete your first monitoring session', icon: '●' },
            { id: 'earlyBird', name: 'Early Bird', desc: 'Start monitoring before 9 AM', icon: '●' },
            { id: 'perfectPosture', name: 'Perfect Posture', desc: 'Maintain 90%+ score for 50 minutes', icon: '●' },
            { id: 'streakMaster', name: 'Streak Master', desc: '7-day good posture streak', icon: '●' },
            { id: 'breakMaster', name: 'Break Master', desc: 'Complete 3 exercise breaks', icon: '●' },
            { id: 'wellnessChampion', name: 'Wellness Champion', desc: 'Use app for 30 consecutive days', icon: '●' }
        ];
        const modal = document.getElementById('achievementsModal');
        let container = null;
        if (modal) {
            container = modal.querySelector('.grid');
            if (!container) {
                const modalContent = modal.querySelector('.glass-strong');
                if (modalContent) {
                    container = modalContent.querySelector('.grid') || modalContent.querySelector('div').nextElementSibling;
                    if (!container || !container.classList.contains('grid')) {
                        const newContainer = document.createElement('div');
                        newContainer.className = 'grid grid-cols-2 gap-4';
                        const header = modalContent.querySelector('h3').parentElement;
                        header.parentNode.insertBefore(newContainer, header.nextSibling);
                        container = newContainer;
                    }
                }
            }
        }
        if (!container) {
            console.error('Could not find achievements grid container');
            return;
        }
        container.innerHTML = '';
        achievements.forEach(achievement => {
            const isUnlocked = this.achievements[achievement.id] && this.achievements[achievement.id].unlocked;
            const progress = this.achievements[achievement.id] && this.achievements[achievement.id].progress || 0;
            const card = document.createElement('div');
            card.className = `glass p-4 rounded-lg achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
            
            let progressText = '';
            if (!isUnlocked && (achievement.id === 'breakMaster' || achievement.id === 'wellnessChampion')) {
                const total = achievement.id === 'breakMaster' ? 3 : 30;
                progressText = `<div class="text-xs text-gray-400">Progress: ${progress}/${total}</div>`;
            }
            
            card.innerHTML = `
                        <div class="text-2xl mb-2">${achievement.icon}</div>
                        <h4 class="font-semibold mb-1">${achievement.name}</h4>
                        <p class="text-sm text-gray-400 mb-2">${achievement.desc}</p>
                        <div class="text-xs">
                            ${isUnlocked ? '<span class="text-green-400">✓ Unlocked</span>' : '<span class="text-gray-500">🔒 Locked</span>'}
                        </div>
                        ${progressText}
                    `;
            container.appendChild(card);
        });
        const unlockedCount = Object.values(this.achievements).filter(a => a && a.unlocked).length;
        const progressBar = modal.querySelector('.bg-gradient-to-r');
        const progressText = modal.querySelector('.text-cyan-300');
        if (progressBar && progressText) {
            const percentage = (unlockedCount / achievements.length) * 100;
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${unlockedCount} / ${achievements.length}`;
        }
    }
    showExportModal() {
        if (this.exportModal) {
            this.exportModal.classList.remove('hidden');
            this.exportModal.classList.add('flex');
        }
    }
    hideExportModal() {
        if (this.exportModal) {
            this.exportModal.classList.add('hidden');
            this.exportModal.classList.remove('flex');
        }
    }
    
    togglePerformanceWidget() {
        if (this.performanceWidget) {
            if (this.performanceWidget.classList.contains('hidden')) {
                this.showPerformanceWidget();
            } else {
                this.hidePerformanceWidget();
            }
        }
    }
    
    showPerformanceWidget() {
        if (this.performanceWidget) {
            this.performanceWidget.classList.remove('hidden');
            this.updatePerformanceWidget();
        }
    }
    
    hidePerformanceWidget() {
        if (this.performanceWidget) {
            this.performanceWidget.classList.add('hidden');
        }
    }
    
    updatePerformanceWidget() {
        if (!this.performanceWidget || this.performanceWidget.classList.contains('hidden')) return;
        
        if (this.realTimeFPS) {
            this.realTimeFPS.textContent = Math.round(this.performanceStats.realTimeFPS);
        }
        
        if (this.avgDetectionTime) {
            this.avgDetectionTime.textContent = Math.round(this.performanceStats.avgDetectionTime) + 'ms';
        }
        
        if (this.autoAdjustStatus) {
            this.autoAdjustStatus.textContent = this.performanceStats.autoAdjustEnabled ? 'ON' : 'OFF';
            this.autoAdjustStatus.className = this.performanceStats.autoAdjustEnabled ? 'text-green-400' : 'text-yellow-400';
        }
        
        if (this.performanceStatus) {
            const fps = this.performanceStats.realTimeFPS;
            const detectionTime = this.performanceStats.avgDetectionTime;
            
            let status = 'Normal';
            let statusClass = 'text-cyan-400';
            
            if (fps < 15 || detectionTime > 200) {
                status = 'Poor';
                statusClass = 'text-red-400';
            } else if (fps < 20 || detectionTime > 100) {
                status = 'Fair';
                statusClass = 'text-yellow-400';
            } else if (fps > 25 && detectionTime < 50) {
                status = 'Excellent';
                statusClass = 'text-green-400';
            }
            
            this.performanceStatus.textContent = status;
            this.performanceStatus.className = statusClass;
        }
    }
    
    updatePerformanceStats(detectionTime) {
        this.performanceStats.frameCount++;
        
        // Update detection time average
        this.performanceStats.lastFiveFrames.push(detectionTime);
        if (this.performanceStats.lastFiveFrames.length > 5) {
            this.performanceStats.lastFiveFrames.shift();
        }
        
        this.performanceStats.avgDetectionTime = 
            this.performanceStats.lastFiveFrames.reduce((sum, time) => sum + time, 0) / 
            this.performanceStats.lastFiveFrames.length;
        
        if (this.settings.adaptiveMode && this.performanceStats.avgDetectionTime > 150) {
            this.autoAdjustPerformance();
        }
    }
    
    updateFPSTracking() {
        const now = performance.now();
        this.performanceStats.fpsCounter++;
        
        if (now - this.performanceStats.lastFPSTime >= 1000) {
            this.performanceStats.realTimeFPS = this.performanceStats.fpsCounter;
            this.performanceStats.fpsCounter = 0;
            this.performanceStats.lastFPSTime = now;
        }
    }
    
    autoAdjustPerformance() {
        if (!this.performanceStats.autoAdjustEnabled) {
            this.performanceStats.autoAdjustEnabled = true;
            
            const currentFPS = parseInt(this.fpsRange.value);
            if (currentFPS > 10) {
                this.fpsRange.value = Math.max(5, currentFPS - 5);
                this.fpsVal.textContent = this.fpsRange.value;
                this.detectionInterval = 1000 / Number(this.fpsRange.value);
                this.logActivity('Auto-adjusted: Reduced FPS for better performance');
            }
        }
    }
    
    downloadExportData() {
        const dateRangeRadios = document.querySelectorAll('input[name="dateRange"]');
        
        let selectedRange = 'today';
        
        dateRangeRadios.forEach(radio => {
            if (radio.checked) selectedRange = radio.value;
        });
        
        const exportData = this.prepareExportData(selectedRange);
        this.downloadJSON(exportData);
        
        this.logActivity('Data exported as JSON');
        this.hideExportModal();
    }
    
    prepareExportData(dateRange) {
        const now = new Date();
        const data = {
            exportDate: now.toISOString(),
            dateRange: dateRange,
            stats: this.stats,
            achievements: this.achievements,
            settings: this.settings
        };
        
        if (dateRange === 'week') {
            data.description = 'Last 7 days of posture data';
        } else if (dateRange === 'month') {
            data.description = 'Last 30 days of posture data';
        } else if (dateRange === 'today') {
            data.description = 'Today\'s posture data';
        } else {
            data.description = 'All posture monitoring data';
        }
        
        return data;
    }
    
    downloadJSON(data) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `posture-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new PostureMonitor();
});