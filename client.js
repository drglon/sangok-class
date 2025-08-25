// 전역 변수
let socket;
let currentRole = null;
let currentClassroom = null;
let currentUser = null;
let selectedMessage = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

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
});

// 선생님 페이지 초기화
function initTeacherPage() {
    console.log('선생님 페이지 초기화');
    
    // 메시지 입력 엔터키 이벤트
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
}

// 학생 페이지 초기화
function initStudentPage() {
    console.log('학생 페이지 초기화');
    
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
        role: currentRole
    });
    
    messageInput.value = '';
}

// 소켓 이벤트 리스너 설정
function setupSocketListeners() {
    // 연결 상태
    socket.on('connect', function() {
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        updateConnectionStatus(false);
    });
    
    // 교실 생성 응답
    socket.on('classroomCreated', function(data) {
        console.log('교실 생성됨:', data);
        currentClassroom = data.classroom;
        currentUser = { name: data.classroom.teacherName, role: 'teacher' };
        updateClassroomInfo(data.classroom);
        showClassroomControls();
    });
    
    // 교실 입장 응답
    socket.on('joinedClassroom', function(data) {
        console.log('교실 입장됨:', data);
        currentClassroom = data.classroom;
        currentUser = { name: data.studentName, role: 'student' };
        updateStudentInterface(data.classroom);
    });
    
    // 교실 상태 변경
    socket.on('classroomToggled', function(data) {
        console.log('교실 상태 변경:', data);
        currentClassroom.isOpen = data.isOpen;
        updateClassroomStatus(data.isOpen);
    });
    
    // 새 메시지 수신
    socket.on('newMessage', function(data) {
        console.log('새 메시지:', data);
        addMessageToCanvas(data);
    });
    
    // 메시지 위치 업데이트
    socket.on('messagePositionUpdated', function(data) {
        updateMessagePosition(data.messageId, data.position);
    });
    
    // 메시지 가시성 토글
    socket.on('messageVisibilityToggled', function(data) {
        toggleMessageVisibility(data.messageId, data.isVisible);
    });
    
    // 메시지 삭제
    socket.on('messageDeleted', function(data) {
        removeMessageFromCanvas(data.messageId);
    });
    
    // 에러 처리
    socket.on('error', function(error) {
        console.error('소켓 에러:', error);
        alert('오류: ' + error.message);
    });
}

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
    
    if (classroomInfo) classroomInfo.style.display = 'block';
    if (messagePanel) messagePanel.style.display = 'block';
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
    const classroomTitle = document.getElementById('classroomTitle');
    
    if (joinSection) joinSection.style.display = 'none';
    if (chatSection) chatSection.style.display = 'block';
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

// 메시지 요소 생성
function createMessageElement(messageData) {
    // 메시지 컨테이너 생성
    const messageContainer = document.createElement('div');
    messageContainer.className = `message-container ${messageData.role}`;
    messageContainer.id = `message-${messageData.id}`;
    messageContainer.setAttribute('data-message-id', messageData.id);
    
    // 위치 설정
    if (messageData.position) {
        messageContainer.style.left = messageData.position.x + 'px';
        messageContainer.style.top = messageData.position.y + 'px';
    } else {
        // 랜덤 위치 (헤더 공간 확보)
        const canvas = document.getElementById('messageCanvas');
        const maxX = canvas.offsetWidth - 200;
        const maxY = canvas.offsetHeight - 120;
        messageContainer.style.left = Math.random() * maxX + 'px';
        messageContainer.style.top = (Math.random() * maxY + 30) + 'px';
    }
    
    // 메시지 헤더 (말풍선 바깥)
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header-outside';
    messageHeader.innerHTML = `
        <span class="message-sender-outside">${escapeHtml(messageData.sender)}</span>
        <span class="message-time-outside">${formatTime(messageData.timestamp)}</span>
    `;
    
    // 말풍선 버블
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${messageData.role}`;
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(messageData.message)}</div>
    `;
    
    // 컨테이너에 헤더와 버블 추가
    messageContainer.appendChild(messageHeader);
    messageContainer.appendChild(messageDiv);
    
    // 드래그 이벤트 (선생님만)
    if (currentRole === 'teacher') {
        messageContainer.draggable = true;
        messageContainer.addEventListener('dragstart', handleDragStart);
        messageContainer.addEventListener('dragend', handleDragEnd);
        messageContainer.addEventListener('dblclick', handleMessageDoubleClick);
        messageContainer.addEventListener('click', handleMessageClick);
    }
    
    return messageContainer;
}

// 드래그 시작
function handleDragStart(e) {
    isDragging = true;
    selectedMessage = e.target.closest('.message-container'); // .message-bubble에서 .message-container로 변경
    
    // 드래그 이미지 설정
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', selectedMessage.outerHTML);
    
    // 드래그 가이드라인 표시
    showDragGuidelines();
    
    // 휴지통 활성화
    const trashArea = document.getElementById('trashArea');
    if (trashArea) {
        trashArea.classList.add('active');
    }
}

// 드래그 종료
function handleDragEnd(e) {
    isDragging = false;
    
    // 드래그 가이드라인 숨기기
    hideDragGuidelines();
    
    // 휴지통 비활성화
    const trashArea = document.getElementById('trashArea');
    if (trashArea) {
        trashArea.classList.remove('active');
    }
}

// 메시지 더블클릭 (가시성 토글)
function handleMessageDoubleClick(e) {
    if (currentRole !== 'teacher') return;
    
    const messageElement = e.target.closest('.message-container'); // .message-bubble에서 .message-container로 변경
    const messageId = messageElement.querySelector('.message-bubble').getAttribute('data-message-id');
    
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
    if (messageElement) {  // null 체크 추가
        selectMessage(messageElement);
    }
}

// 메시지 선택
function selectMessage(messageElement) {
    // 이전 선택 해제
    deselectMessage();
    
    // 새로운 선택
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
    // 효과음 재생
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
                
                // 메시지 위치 업데이트
                selectedMessage.style.left = x + 'px';
                selectedMessage.style.top = y + 'px';
                
                // 서버에 위치 업데이트 전송
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

// 효과음 재생 함수 (파일 상단에 추가)
function playTrashSound() {
    // Web Audio API를 사용한 간단한 효과음
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 휴지통 소리 효과 (짧은 "뿅" 소리)
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // 주파수 변화로 "뿅" 효과
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);
    
    // 볼륨 조절
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// 더 재미있는 "휴지통 떨어지는" 소리
function playTrashDropSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 첫 번째 소리: 높은 톤 (떨어지는 소리)
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
    
    // 두 번째 소리: 낮은 톤 (착지 소리)
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