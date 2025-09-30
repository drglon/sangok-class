// ===== 업그레이드 버전 클라이언트 JavaScript =====
// 파일 업로드, 뷰어, 실시간 동기화 기능 포함

// 전역 변수
let socket;
let currentRole = null;
let currentClassroom = null;
let currentUser = null;
let selectedMessage = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let currentMaterials = [];
let currentMaterialIndex = 0;
let fileUploadQueue = [];

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    // Socket.IO 연결
    socket = io();
    
    // 현재 페이지가 선생님 페이지인지 학생 페이지인지 확인
    if (window.location.pathname.includes('teacher')) {
        currentRole = 'teacher';
        initTeacherPage();
    } else {
        currentRole = 'student';
        initStudentPage();
    }
    
    // 소켓 이벤트 리스너 설정
    setupSocketListeners();
    
    // 키보드 이벤트 리스너
    document.addEventListener('keydown', handleKeyDown);
    
    // 메시지 캔버스 클릭 이벤트 (선택 해제)
    const canvas = document.getElementById('messageCanvas');
    if (canvas) {
        canvas.addEventListener('click', function(e) {
            if (e.target === canvas) {
                deselectMessage();
            }
        });
    }
    
    // 파일 업로드 관련 초기화
    initFileUpload();
    
    // 자료 플로우 초기화
    initMaterialFlow();
});

// 선생님 페이지 초기화
function initTeacherPage() {
    console.log('선생님 페이지 초기화 (업그레이드 버전)');
    
    // 메시지 입력 엔터키 이벤트
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    // 자료 관리 패널 초기화
    initMaterialManagement();
}

// 학생 페이지 초기화
function initStudentPage() {
    console.log('학생 페이지 초기화 (업그레이드 버전)');
    
    // 입장 폼 이벤트
    const joinForm = document.getElementById('joinForm');
    if (joinForm) {
        joinForm.addEventListener('submit', function(e) {
            e.preventDefault();
            joinClassroom();
        });
    }
    
    // 메시지 입력 엔터키 이벤트
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    // 뷰어 패널 초기화
    initViewerPanel();
}

// 파일 업로드 초기화
function initFileUpload() {
    if (currentRole !== 'teacher') return;
    
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('materialDropZone');
    const youtubeInput = document.getElementById('youtubeInput');
    const addYoutubeBtn = document.getElementById('addYoutubeBtn');
    
    // 파일 선택 이벤트
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    // 드래그앤드롭 이벤트
    if (dropZone) {
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleFileDrop);
    }
    
    // YouTube 링크 추가
    if (addYoutubeBtn) {
        addYoutubeBtn.addEventListener('click', addYoutubeLink);
    }
    
    if (youtubeInput) {
        youtubeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addYoutubeLink();
            }
        });
    }
}

// 자료 플로우 초기화
function initMaterialFlow() {
    if (currentRole !== 'teacher') return;
    
    const materialList = document.getElementById('materialList');
    if (materialList) {
        // Sortable.js를 사용한 드래그앤드롭 순서 변경
        new Sortable(materialList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function(evt) {
                updateMaterialOrder();
            }
        });
    }
}

// 자료 관리 패널 초기화
function initMaterialManagement() {
    const prevBtn = document.getElementById('prevMaterialBtn');
    const nextBtn = document.getElementById('nextMaterialBtn');
    const materialCounter = document.getElementById('materialCounter');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', showPreviousMaterial);
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', showNextMaterial);
    }
    
    updateMaterialNavigation();
}

// 뷰어 패널 초기화 (학생용)
function initViewerPanel() {
    const viewer = document.getElementById('materialViewer');
    if (viewer) {
        // 뷰어 크기 조절 이벤트
        window.addEventListener('resize', resizeViewer);
    }
}

// 교실 생성 (선생님용)
function createClassroom() {
    const classroomName = document.getElementById('classroomName').value.trim();
    const teacherName = document.getElementById('teacherName').value.trim();
    
    if (!classroomName || !teacherName) {
        alert('교실 이름과 선생님 이름을 모두 입력해주세요.');
        return;
    }
    
    console.log('교실 생성 요청:', { classroomName, teacherName });
    
    socket.emit('createClassroom', {
        classroomName: classroomName,
        teacherName: teacherName
    });
}

// 교실 입장 (학생용)
function joinClassroom() {
    const studentName = document.getElementById('studentName').value.trim();
    const classroomCode = document.getElementById('classroomCode').value.trim();
    
    if (!studentName || !classroomCode) {
        alert('이름과 교실 코드를 모두 입력해주세요.');
        return;
    }
    
    console.log('교실 입장 요청:', { studentName, classroomCode });
    
    socket.emit('joinClassroom', {
        studentName: studentName,
        classroomCode: classroomCode
    });
}

// 교실 열기/닫기 토글
function toggleClassroom() {
    if (!currentClassroom) return;
    
    const newStatus = currentClassroom.isOpen ? 'close' : 'open';
    socket.emit('toggleClassroom', {
        classroomId: currentClassroom.id,
        action: newStatus
    });
}

// 메시지 전송
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message || !currentClassroom) return;
    
    console.log('메시지 전송:', message);
    
    socket.emit('sendMessage', {
        classroomId: currentClassroom.id,
        message: message,
        sender: currentUser.name,
        role: currentUser.role
    });
    
    messageInput.value = '';
}

// 파일 선택 처리
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    processFiles(files);
}

// 드래그 오버 처리
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

// 드래그 리브 처리
function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

// 파일 드롭 처리
function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
}

// 파일 처리
function processFiles(files) {
    files.forEach(file => {
        if (isValidFileType(file)) {
            uploadFile(file);
        } else {
            alert(`지원하지 않는 파일 형식입니다: ${file.name}`);
        }
    });
}

// 유효한 파일 타입 확인
function isValidFileType(file) {
    const validTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'video/mp4', 'video/webm', 'video/ogg'
    ];
    
    return validTypes.includes(file.type);
}

// 파일 업로드
function uploadFile(file) {
    if (!currentClassroom || !currentClassroom.id) {
        alert('교실에 먼저 입장해주세요.');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    // 업로드 진행 표시
    const uploadItem = createUploadProgressItem(file.name);
    
    // 올바른 API 엔드포인트 사용 (교실 ID 포함)
    fetch(`/api/upload/${currentClassroom.id}`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            addMaterialToList(data.material);
            removeUploadProgressItem(uploadItem);
            
            // 서버에 자료 추가 알림
            socket.emit('materialAdded', {
                classroomId: currentClassroom.id,
                material: data.material
            });
        } else {
            throw new Error(data.error || '업로드 실패');
        }
    })
    .catch(error => {
        console.error('업로드 실패:', error);
        alert('파일 업로드에 실패했습니다: ' + error.message);
        removeUploadProgressItem(uploadItem);
    });
}

// YouTube 링크 추가
function addYoutubeLink() {
    const youtubeInput = document.getElementById('youtubeInput');
    const url = youtubeInput.value.trim();
    
    if (!url) return;
    
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
        alert('유효한 YouTube URL을 입력해주세요.');
        return;
    }
    
    const youtubeMaterial = {
        id: Date.now().toString(),
        type: 'youtube',
        title: 'YouTube 동영상',
        url: url,
        videoId: videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
    
    addMaterialToList(youtubeMaterial);
    youtubeInput.value = '';
    
    // 서버에 자료 추가 알림
    socket.emit('materialAdded', {
        classroomId: currentClassroom.id,
        material: youtubeMaterial
    });
}

// YouTube 비디오 ID 추출
function extractYouTubeVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

// 자료 목록에 추가
function addMaterialToList(material) {
    currentMaterials.push(material);
    
    const materialList = document.getElementById('materialList');
    if (materialList) {
        const materialItem = createMaterialListItem(material);
        materialList.appendChild(materialItem);
    }
    
    updateMaterialNavigation();
    
    // 첫 번째 자료라면 자동으로 표시
    if (currentMaterials.length === 1) {
        showMaterial(0);
    }
}

// 자료 목록 아이템 생성
function createMaterialListItem(material) {
    const item = document.createElement('div');
    item.className = 'material-item';
    item.setAttribute('data-material-id', material.id);
    
    let thumbnail = '';
    let title = material.title || material.name || '제목 없음';
    
    switch (material.type) {
        case 'image':
            thumbnail = `<img src="${material.url}" alt="${title}">`;
            break;
        case 'pdf':
            thumbnail = '<div class="file-icon pdf-icon">📄</div>';
            break;
        case 'powerpoint':
            thumbnail = '<div class="file-icon ppt-icon">📊</div>';
            break;
        case 'video':
            thumbnail = '<div class="file-icon video-icon">🎬</div>';
            break;
        case 'youtube':
            thumbnail = `<img src="${material.thumbnail}" alt="${title}">`;
            break;
        default:
            thumbnail = '<div class="file-icon">📁</div>';
    }
    
    item.innerHTML = `
        <div class="material-thumbnail">${thumbnail}</div>
        <div class="material-info">
            <div class="material-title">${escapeHtml(title)}</div>
            <div class="material-type">${getTypeDisplayName(material.type)}</div>
        </div>
        <div class="material-actions">
            <button onclick="showMaterialById('${material.id}')" class="btn-icon" title="보기">
                👁️
            </button>
            <button onclick="deleteMaterial('${material.id}')" class="btn-icon danger" title="삭제">
                🗑️
            </button>
        </div>
    `;
    
    return item;
}

// 타입 표시명 반환
function getTypeDisplayName(type) {
    const typeNames = {
        'image': '이미지',
        'pdf': 'PDF',
        'powerpoint': 'PowerPoint',
        'video': '동영상',
        'youtube': 'YouTube'
    };
    
    return typeNames[type] || '파일';
}

// ID로 자료 표시
function showMaterialById(materialId) {
    const index = currentMaterials.findIndex(m => m.id === materialId);
    if (index !== -1) {
        showMaterial(index);
    }
}

// 자료 표시
function showMaterial(index) {
    if (index < 0 || index >= currentMaterials.length) return;
    
    currentMaterialIndex = index;
    const material = currentMaterials[index];
    
    // 선생님 화면에서 자료 표시
    if (currentRole === 'teacher') {
        displayMaterialInTeacherView(material);
    }
    
    // 학생들에게 자료 동기화
    socket.emit('showMaterial', {
        classroomId: currentClassroom.id,
        materialIndex: index,
        material: material
    });
    
    updateMaterialNavigation();
}

// 선생님 화면에서 자료 표시
function displayMaterialInTeacherView(material) {
    const preview = document.getElementById('materialPreview');
    if (!preview) return;
    
    preview.innerHTML = createMaterialViewer(material);
}

// 자료 뷰어 생성
function createMaterialViewer(material) {
    switch (material.type) {
        case 'image':
            return `<img src="${material.url}" alt="${material.title}" class="material-image">`;
            
        case 'pdf':
            return `
                <iframe src="${material.url}" 
                        class="material-pdf" 
                        frameborder="0">
                </iframe>
            `;
            
        case 'powerpoint':
            return `
                <iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(material.url)}" 
                        class="material-powerpoint" 
                        frameborder="0">
                </iframe>
            `;
            
        case 'video':
            return `
                <video controls class="material-video">
                    <source src="${material.url}" type="${material.mimeType}">
                    브라우저가 비디오를 지원하지 않습니다.
                </video>
            `;
            
        case 'youtube':
            return `
                <iframe src="https://www.youtube.com/embed/${material.videoId}" 
                        class="material-youtube" 
                        frameborder="0" 
                        allowfullscreen>
                </iframe>
            `;
            
        default:
            return '<div class="material-error">지원하지 않는 파일 형식입니다.</div>';
    }
}

// 이전 자료 표시
function showPreviousMaterial() {
    if (currentMaterialIndex > 0) {
        showMaterial(currentMaterialIndex - 1);
    }
}

// 다음 자료 표시
function showNextMaterial() {
    if (currentMaterialIndex < currentMaterials.length - 1) {
        showMaterial(currentMaterialIndex + 1);
    }
}

// 자료 네비게이션 업데이트
function updateMaterialNavigation() {
    const prevBtn = document.getElementById('prevMaterialBtn');
    const nextBtn = document.getElementById('nextMaterialBtn');
    const counter = document.getElementById('materialCounter');
    
    if (prevBtn) {
        prevBtn.disabled = currentMaterialIndex <= 0;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentMaterialIndex >= currentMaterials.length - 1;
    }
    
    if (counter) {
        if (currentMaterials.length > 0) {
            counter.textContent = `${currentMaterialIndex + 1} / ${currentMaterials.length}`;
        } else {
            counter.textContent = '0 / 0';
        }
    }
}

// 자료 순서 업데이트
function updateMaterialOrder() {
    const materialList = document.getElementById('materialList');
    if (!materialList) return;
    
    const items = Array.from(materialList.children);
    const newOrder = items.map(item => {
        const materialId = item.getAttribute('data-material-id');
        return currentMaterials.find(m => m.id === materialId);
    }).filter(Boolean);
    
    currentMaterials = newOrder;
    
    // 서버에 순서 변경 알림
    socket.emit('materialsReordered', {
        classroomId: currentClassroom.id,
        materials: currentMaterials
    });
}

// 자료 삭제
function deleteMaterial(materialId) {
    if (!confirm('이 자료를 삭제하시겠습니까?')) return;
    
    const index = currentMaterials.findIndex(m => m.id === materialId);
    if (index === -1) return;
    
    // 배열에서 제거
    currentMaterials.splice(index, 1);
    
    // DOM에서 제거
    const materialItem = document.querySelector(`[data-material-id="${materialId}"]`);
    if (materialItem) {
        materialItem.remove();
    }
    
    // 현재 인덱스 조정
    if (currentMaterialIndex >= currentMaterials.length) {
        currentMaterialIndex = Math.max(0, currentMaterials.length - 1);
    }
    
    // 자료가 남아있으면 현재 인덱스의 자료 표시
    if (currentMaterials.length > 0) {
        showMaterial(currentMaterialIndex);
    } else {
        // 모든 자료가 삭제되면 빈 화면
        const preview = document.getElementById('materialPreview');
        if (preview) {
            preview.innerHTML = '<div class="no-material">표시할 자료가 없습니다.</div>';
        }
    }
    
    updateMaterialNavigation();
    
    // 서버에 삭제 알림
    socket.emit('materialDeleted', {
        classroomId: currentClassroom.id,
        materialId: materialId
    });
}

// 업로드 진행 아이템 생성
function createUploadProgressItem(fileName) {
    const uploadList = document.getElementById('uploadProgress');
    if (!uploadList) return null;
    
    const item = document.createElement('div');
    item.className = 'upload-item';
    item.innerHTML = `
        <div class="upload-info">
            <span class="upload-filename">${escapeHtml(fileName)}</span>
            <span class="upload-status">업로드 중...</span>
        </div>
        <div class="upload-progress-bar">
            <div class="upload-progress-fill"></div>
        </div>
    `;
    
    uploadList.appendChild(item);
    return item;
}

// 업로드 진행 아이템 제거
function removeUploadProgressItem(item) {
    if (item && item.parentNode) {
        item.parentNode.removeChild(item);
    }
}

// 뷰어 크기 조절
function resizeViewer() {
    const viewer = document.getElementById('materialViewer');
    if (!viewer) return;
    
    // 뷰어 크기를 부모 컨테이너에 맞게 조절
    const container = viewer.parentElement;
    if (container) {
        const containerRect = container.getBoundingClientRect();
        viewer.style.width = containerRect.width + 'px';
        viewer.style.height = containerRect.height + 'px';
    }
}

// 소켓 이벤트 리스너 설정 (기존 + 새로운 이벤트)
function setupSocketListeners() {
    // 기존 이벤트들...
    socket.on('connect', function() {
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        updateConnectionStatus(false);
    });
    
    socket.on('classroomCreated', function(data) {
        console.log('교실 생성됨:', data);
        currentClassroom = data.classroom;
        currentUser = { name: data.classroom.teacherName, role: 'teacher' };
        updateClassroomInfo(data.classroom);
        showClassroomControls();
    });
    
    socket.on('joinedClassroom', function(data) {
        console.log('교실 입장됨:', data);
        currentClassroom = data.classroom;
        currentUser = { name: data.studentName, role: 'student' };
        updateStudentInterface(data.classroom);
        
        // 기존 자료 목록 로드
        if (data.classroom.materials) {
            currentMaterials = data.classroom.materials;
            if (currentMaterials.length > 0) {
                displayMaterialInStudentView(currentMaterials[data.classroom.currentMaterialIndex || 0]);
            }
        }
    });
    
    socket.on('classroomToggled', function(data) {
        console.log('교실 상태 변경:', data);
        currentClassroom.isOpen = data.isOpen;
        updateClassroomStatus(data.isOpen);
    });
    
    socket.on('newMessage', function(data) {
        console.log('새 메시지:', data);
        addMessageToCanvas(data);
    });
    
    socket.on('messagePositionUpdated', function(data) {
        updateMessagePosition(data.messageId, data.position);
    });
    
    socket.on('messageVisibilityToggled', function(data) {
        toggleMessageVisibility(data.messageId, data.isVisible);
    });
    
    socket.on('messageDeleted', function(data) {
        removeMessageFromCanvas(data.messageId);
    });
    
    // 새로운 자료 관련 이벤트들
    socket.on('materialAdded', function(data) {
        if (currentRole === 'student') {
            currentMaterials.push(data.material);
        }
    });
    
    socket.on('materialShown', function(data) {
        if (currentRole === 'student') {
            currentMaterialIndex = data.materialIndex;
            displayMaterialInStudentView(data.material);
        }
    });
    
    socket.on('materialsReordered', function(data) {
        if (currentRole === 'student') {
            currentMaterials = data.materials;
        }
    });
    
    socket.on('materialDeleted', function(data) {
        if (currentRole === 'student') {
            const index = currentMaterials.findIndex(m => m.id === data.materialId);
            if (index !== -1) {
                currentMaterials.splice(index, 1);
                
                // 현재 표시 중인 자료가 삭제된 경우
                if (index === currentMaterialIndex) {
                    if (currentMaterials.length > 0) {
                        const newIndex = Math.min(currentMaterialIndex, currentMaterials.length - 1);
                        displayMaterialInStudentView(currentMaterials[newIndex]);
                    } else {
                        clearStudentViewer();
                    }
                }
            }
        }
    });
    
    socket.on('error', function(error) {
        console.error('소켓 에러:', error);
        alert('오류: ' + error.message);
    });
}

// 학생 화면에서 자료 표시
function displayMaterialInStudentView(material) {
    const viewer = document.getElementById('materialViewer');
    if (!viewer) return;
    
    viewer.innerHTML = createMaterialViewer(material);
    
    // 뷰어 크기 조절
    setTimeout(resizeViewer, 100);
}

// 학생 뷰어 초기화
function clearStudentViewer() {
    const viewer = document.getElementById('materialViewer');
    if (viewer) {
        viewer.innerHTML = '<div class="no-material">표시할 자료가 없습니다.</div>';
    }
}

// 기존 함수들 (updateConnectionStatus, updateClassroomInfo, 등등...)
// ... existing code ...

// 연결 상태 업데이트
function updateConnectionStatus(isConnected) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');
    
    if (statusDot && statusText) {
        if (isConnected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = '연결됨';
        } else {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = '연결 끊김';
        }
    }
}

// 교실 정보 업데이트 (선생님용)
function updateClassroomInfo(classroom) {
    const classroomDetails = document.getElementById('classroomDetails');
    const headerInfo = document.getElementById('headerClassroomInfo');
    
    if (classroomDetails) {
        classroomDetails.innerHTML = `
            <p><strong>교실명:</strong> ${classroom.name}</p>
            <p><strong>교실 코드:</strong> <code>${classroom.id}</code></p>
            <p><strong>상태:</strong> <span id="classroomStatus">${classroom.isOpen ? '열림' : '닫힘'}</span></p>
            <p><strong>참여자:</strong> <span id="participantCount">${classroom.participants || 0}명</span></p>
        `;
    }
    
    if (headerInfo) {
        headerInfo.textContent = `${classroom.name} (코드: ${classroom.id})`;
    }
}

// 교실 컨트롤 표시
function showClassroomControls() {
    const classroomInfo = document.getElementById('classroomInfo');
    const messagePanel = document.getElementById('messagePanel');
    const materialPanel = document.getElementById('materialPanel');
    
    if (classroomInfo) classroomInfo.style.display = 'block';
    if (messagePanel) messagePanel.style.display = 'block';
    if (materialPanel) materialPanel.style.display = 'block';
}

// 교실 상태 업데이트
function updateClassroomStatus(isOpen) {
    const statusElement = document.getElementById('classroomStatus');
    const toggleBtn = document.getElementById('toggleClassroomBtn');
    
    if (statusElement) {
        statusElement.textContent = isOpen ? '열림' : '닫힘';
    }
    
    if (toggleBtn) {
        toggleBtn.textContent = isOpen ? '교실 닫기' : '교실 열기';
        toggleBtn.className = isOpen ? 'btn danger' : 'btn primary';
    }
}

// 학생 인터페이스 업데이트
function updateStudentInterface(classroom) {
    const joinSection = document.getElementById('joinSection');
    const chatSection = document.getElementById('chatSection');
    const viewerSection = document.getElementById('viewerSection');
    const classroomTitle = document.getElementById('classroomTitle');
    
    if (joinSection) joinSection.style.display = 'none';
    if (chatSection) chatSection.style.display = 'block';
    if (viewerSection) viewerSection.style.display = 'block';
    if (classroomTitle) classroomTitle.textContent = classroom.name;
}

// 메시지를 캔버스에 추가
function addMessageToCanvas(messageData) {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    const messageElement = createMessageElement(messageData);
    canvas.appendChild(messageElement);
    
    // 애니메이션 효과
    setTimeout(() => {
        messageElement.classList.add('message-appear');
    }, 10);
}

// 메시지 요소 생성 (기존과 동일)
function createMessageElement(messageData) {
    // ... existing code ...
    const messageContainer = document.createElement('div');
    messageContainer.className = `message-container ${messageData.role}`;
    messageContainer.id = `message-${messageData.id}`;
    messageContainer.setAttribute('data-message-id', messageData.id);
    
    if (messageData.position) {
        messageContainer.style.left = messageData.position.x + 'px';
        messageContainer.style.top = messageData.position.y + 'px';
    } else {
        const canvas = document.getElementById('messageCanvas');
        const maxX = canvas.offsetWidth - 200;
        const maxY = canvas.offsetHeight - 120;
        messageContainer.style.left = Math.random() * maxX + 'px';
        messageContainer.style.top = (Math.random() * maxY + 30) + 'px';
    }
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header-outside';
    messageHeader.innerHTML = `
        <span class="message-sender-outside">${escapeHtml(messageData.sender)}</span>
        <span class="message-time-outside">${formatTime(messageData.timestamp)}</span>
    `;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${messageData.role}`;
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(messageData.message)}</div>
    `;
    
    messageContainer.appendChild(messageHeader);
    messageContainer.appendChild(messageDiv);
    
    if (currentRole === 'teacher') {
        messageContainer.draggable = true;
        messageContainer.addEventListener('dragstart', handleDragStart);
        messageContainer.addEventListener('dragend', handleDragEnd);
        messageContainer.addEventListener('dblclick', handleMessageDoubleClick);
        messageContainer.addEventListener('click', handleMessageClick);
    }
    
    return messageContainer;
}

// 나머지 기존 함수들 (드래그, 메시지 관리 등)
// ... existing code ...

// HTML 이스케이프
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 시간 포맷팅
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 드래그 시작
function handleDragStart(e) {
    isDragging = true;
    selectedMessage = e.target.closest('.message-container');
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', selectedMessage.outerHTML);
    
    showDragGuidelines();
    
    const trashArea = document.getElementById('trashArea');
    if (trashArea) {
        trashArea.classList.add('active');
    }
}

// 드래그 종료
function handleDragEnd(e) {
    isDragging = false;
    
    hideDragGuidelines();
    
    const trashArea = document.getElementById('trashArea');
    if (trashArea) {
        trashArea.classList.remove('active');
    }
}

// 메시지 더블클릭 (가시성 토글)
function handleMessageDoubleClick(e) {
    if (currentRole !== 'teacher') return;
    
    const messageElement = e.target.closest('.message-container');
    const messageId = messageElement.getAttribute('data-message-id');
    
    socket.emit('toggleMessageVisibility', {
        classroomId: currentClassroom.id,
        messageId: messageId
    });
}

// 메시지 클릭 (선택)
function handleMessageClick(e) {
    if (currentRole !== 'teacher') return;
    
    e.stopPropagation();
    const messageElement = e.target.closest('.message-container');
    if (messageElement) {
        selectMessage(messageElement);
    }
}

// 메시지 선택
function selectMessage(messageElement) {
    deselectMessage();
    selectedMessage = messageElement;
    messageElement.classList.add('selected');
}

// 메시지 선택 해제
function deselectMessage() {
    if (selectedMessage) {
        selectedMessage.classList.remove('selected');
        selectedMessage = null;
    }
}

// 키보드 이벤트 처리
function handleKeyDown(e) {
    if (currentRole !== 'teacher') return;
    
    if (e.key === 'Delete' && selectedMessage) {
        const messageId = selectedMessage.getAttribute('data-message-id');
        deleteMessage(messageId);
    }
}

// 메시지 삭제
function deleteMessage(messageId) {
    playTrashDropSound();
    
    socket.emit('deleteMessage', {
        classroomId: currentClassroom.id,
        messageId: messageId
    });
}

// 메시지 위치 업데이트
function updateMessagePosition(messageId, position) {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
        messageElement.style.left = position.x + 'px';
        messageElement.style.top = position.y + 'px';
    }
}

// 메시지 가시성 토글
function toggleMessageVisibility(messageId, isVisible) {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
        if (isVisible) {
            messageElement.classList.remove('hidden');
        } else {
            messageElement.classList.add('hidden');
        }
    }
}

// 메시지 캔버스에서 제거
function removeMessageFromCanvas(messageId) {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
        messageElement.classList.add('message-disappear');
        setTimeout(() => {
            messageElement.remove();
        }, 300);
    }
}

// 드래그 가이드라인 표시
function showDragGuidelines() {
    const guidelines = document.getElementById('dragGuidelines');
    if (guidelines) {
        guidelines.style.display = 'block';
    }
}

// 드래그 가이드라인 숨기기
function hideDragGuidelines() {
    const guidelines = document.getElementById('dragGuidelines');
    if (guidelines) {
        guidelines.style.display = 'none';
    }
}

// 효과음 재생 함수들
function playTrashDropSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    
    osc1.frequency.setValueAtTime(600, audioContext.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
    
    gain1.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    osc1.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + 0.3);
    
    setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        
        osc2.frequency.setValueAtTime(150, audioContext.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.1);
        
        gain2.gain.setValueAtTime(0.4, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.1);
    }, 250);
}

// 드롭 영역 설정
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('messageCanvas');
    const trashArea = document.getElementById('trashArea');
    
    if (canvas) {
        canvas.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        canvas.addEventListener('drop', function(e) {
            e.preventDefault();
            
            if (selectedMessage && currentRole === 'teacher') {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                selectedMessage.style.left = x + 'px';
                selectedMessage.style.top = y + 'px';
                
                const messageId = selectedMessage.getAttribute('data-message-id');
                socket.emit('updateMessagePosition', {
                    classroomId: currentClassroom.id,
                    messageId: messageId,
                    position: { x: x, y: y }
                });
            }
        });
    }
    
    if (trashArea) {
        trashArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            trashArea.classList.add('drag-over');
        });
        
        trashArea.addEventListener('dragleave', function(e) {
            trashArea.classList.remove('drag-over');
        });
        
        trashArea.addEventListener('drop', function(e) {
            e.preventDefault();
            trashArea.classList.remove('drag-over');
            
            if (selectedMessage && currentRole === 'teacher') {
                const messageId = selectedMessage.getAttribute('data-message-id');
                deleteMessage(messageId);
            }
        });
    }
});