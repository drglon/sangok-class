// 전역 변수
let socket;
let currentRole = null;
let currentClassroom = null;
let currentUser = null;
let selectedMessage = null;
let isDragging = false;

// 드래그 관련 변수 추가
let dragOffset = { x: 0, y: 0 };
let dragStartPos = { x: 0, y: 0 };
let isMouseDragging = false;
let mouseStartPos = { x: 0, y: 0 };
let elementStartPos = { x: 0, y: 0 };

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
    
    // 전역 마우스 이벤트 리스너 추가
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    // 메시지 캔버스 클릭 이벤트 (선택 해제)
    const canvas = document.getElementById('messageCanvas');
    if (canvas) {
        canvas.addEventListener('click', function(e) {
            if (e.target === canvas) {
                deselectMessage();
            }
        });
        
        // 새로운 마우스 기반 드래그 시스템
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        canvas.addEventListener('mouseup', handleCanvasMouseUp);
        canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
    }
    
    // 휴지통 드래그 앤 드롭 이벤트
    const trashArea = document.getElementById('trashArea');
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

// 선생님 페이지 초기화
function initTeacherPage() {
    console.log('선생님 페이지 초기화');
    
    // 메시지 입력 키보드 이벤트 (Shift+Enter: 줄바꿈, Enter: 전송)
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Shift+Enter: 줄바꿈 허용 (기본 동작)
                    return;
                } else {
                    // Enter: 메시지 전송
                    e.preventDefault();
                    sendMessage();
                }
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
    
    // 메시지 입력 키보드 이벤트 (Shift+Enter: 줄바꿈, Enter: 전송)
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Shift+Enter: 줄바꿈 허용 (기본 동작)
                    return;
                } else {
                    // Enter: 메시지 전송
                    e.preventDefault();
                    sendMessage();
                }
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
        role: currentUser.role  // currentRole → currentUser.role로 변경
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
    
    // 위치 설정 - 선생님 메시지는 중앙상단에서 순차적으로 배치
    if (messageData.role === 'teacher') {
        // 선생님 메시지는 화면 중앙상단에서 순차적으로 배치
        const canvas = document.getElementById('messageCanvas');
        const centerX = (canvas.offsetWidth / 2) - 150; // 메시지 폭의 절반만큼 왼쪽으로
        
        // 기존 선생님 메시지들의 개수를 세어서 Y 위치 계산
        const existingTeacherMessages = canvas.querySelectorAll('.message-container.teacher');
        const messageHeight = 120; // 메시지 높이 + 여백
        const startY = 30; // 시작 Y 위치
        const newY = startY + (existingTeacherMessages.length * messageHeight);
        
        messageContainer.style.left = centerX + 'px';
        messageContainer.style.top = newY + 'px';
        messageContainer.style.position = 'absolute';
        messageContainer.style.zIndex = '100'; // 다른 메시지보다 위에 표시
    } else if (messageData.position) {
        messageContainer.style.left = messageData.position.x + 'px';
        messageContainer.style.top = messageData.position.y + 'px';
    } else {
        // 학생 메시지는 겹치지 않는 위치 자동 찾기
        const canvas = document.getElementById('messageCanvas');
        const position = findNonOverlappingPosition(canvas);
        messageContainer.style.left = position.x + 'px';
        messageContainer.style.top = position.y + 'px';
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
    
    // 드래그 이벤트 (선생님만) - 새로운 시스템 적용
    if (currentRole === 'teacher') {
        messageContainer.addEventListener('mousedown', handleMouseDown);
        messageContainer.addEventListener('dblclick', handleMessageDoubleClick);
        messageContainer.addEventListener('click', handleMessageClick);
        
        // 기본 드래그 비활성화
        messageContainer.draggable = false;
        messageContainer.style.userSelect = 'none';
    }
    
    return messageContainer;
}

// 새로운 드래그 시작 함수 (mousedown 기반)
function handleMouseDown(e) {
    if (currentRole !== 'teacher') return;
    
    e.preventDefault();
    isMouseDragging = true;
    selectedMessage = e.target.closest('.message-container');
    
    if (!selectedMessage) return;
    
    // 마우스 시작 위치 저장
    mouseStartPos.x = e.clientX;
    mouseStartPos.y = e.clientY;
    
    // 요소의 현재 위치 저장
    const rect = selectedMessage.getBoundingClientRect();
    const canvasRect = document.getElementById('messageCanvas').getBoundingClientRect();
    
    elementStartPos.x = rect.left - canvasRect.left;
    elementStartPos.y = rect.top - canvasRect.top;
    
    // 드래그 시작 시 오프셋 계산
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    // 드래그 스타일 적용
    selectedMessage.classList.add('dragging');
    selectedMessage.style.zIndex = '1000';
    selectedMessage.style.transition = 'none'; // 드래그 중 애니메이션 비활성화
    
    // 가이드라인 및 휴지통 활성화
    showDragGuidelines();
    const trashArea = document.getElementById('trashArea');
    if (trashArea) {
        trashArea.classList.add('active');
    }
    
    // 마우스 커서 변경
    document.body.style.cursor = 'grabbing';
}

// 실시간 마우스 이동 처리
function handleGlobalMouseMove(e) {
    if (!isMouseDragging || !selectedMessage) return;
    
    e.preventDefault();
    
    const canvas = document.getElementById('messageCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    // 마우스 이동 거리 계산
    const deltaX = e.clientX - mouseStartPos.x;
    const deltaY = e.clientY - mouseStartPos.y;
    
    // 새로운 위치 계산
    let newX = elementStartPos.x + deltaX;
    let newY = elementStartPos.y + deltaY;
    
    // 경계 처리
    const messageRect = selectedMessage.getBoundingClientRect();
    const messageWidth = messageRect.width;
    const messageHeight = messageRect.height;
    
    const minX = 0;
    const minY = 0;
    const maxX = canvas.clientWidth - messageWidth;
    const maxY = canvas.clientHeight - messageHeight;
    
    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));
    
    // 실시간 위치 업데이트 (즉시 반영)
    selectedMessage.style.left = newX + 'px';
    selectedMessage.style.top = newY + 'px';
    
    // 휴지통 영역 체크
    const trashArea = document.getElementById('trashArea');
    if (trashArea) {
        const trashRect = trashArea.getBoundingClientRect();
        const isOverTrash = (
            e.clientX >= trashRect.left &&
            e.clientX <= trashRect.right &&
            e.clientY >= trashRect.top &&
            e.clientY <= trashRect.bottom
        );
        
        if (isOverTrash) {
            trashArea.classList.add('drag-over');
        } else {
            trashArea.classList.remove('drag-over');
        }
    }
}

// 드래그 종료 처리
function handleGlobalMouseUp(e) {
    if (!isMouseDragging) return;
    
    isMouseDragging = false;
    
    if (selectedMessage) {
        // 드래그 스타일 제거
        selectedMessage.classList.remove('dragging');
        selectedMessage.style.zIndex = '';
        selectedMessage.style.transition = ''; // 애니메이션 복원
        
        // 휴지통 영역 체크
        const trashArea = document.getElementById('trashArea');
        if (trashArea && trashArea.classList.contains('drag-over')) {
            // 휴지통에 드롭된 경우
            const messageId = selectedMessage.getAttribute('data-message-id');
            deleteMessage(messageId);
        } else {
            // 일반 위치 업데이트
            const canvas = document.getElementById('messageCanvas');
            const canvasRect = canvas.getBoundingClientRect();
            const messageRect = selectedMessage.getBoundingClientRect();
            
            const finalX = messageRect.left - canvasRect.left;
            const finalY = messageRect.top - canvasRect.top;
            
            // 서버에 최종 위치 전송
            const messageId = selectedMessage.getAttribute('data-message-id');
            socket.emit('updateMessagePosition', {
                classroomId: currentClassroom.id,
                messageId: messageId,
                position: { x: finalX, y: finalY }
            });
        }
    }
    
    // 정리
    hideDragGuidelines();
    const trashArea = document.getElementById('trashArea');
    if (trashArea) {
        trashArea.classList.remove('active', 'drag-over');
    }
    
    document.body.style.cursor = '';
    
    // 변수 초기화
    mouseStartPos = { x: 0, y: 0 };
    elementStartPos = { x: 0, y: 0 };
    dragOffset = { x: 0, y: 0 };
}

// 캔버스 마우스 이벤트 함수들
function handleCanvasMouseMove(e) {
    // 캔버스 내에서의 마우스 이동은 전역 핸들러가 처리
}

function handleCanvasMouseUp(e) {
    // 캔버스 내에서의 마우스 업은 전역 핸들러가 처리
}

// 캔버스 영역을 벗어났을 때 처리
function handleCanvasMouseLeave(e) {
    // 드래그 중이고 마우스가 캔버스를 벗어난 경우에도 계속 추적
    if (isMouseDragging) {
        // 전역 이벤트로 계속 처리됨
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
    return new Date(timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 중복된 DOMContentLoaded 블록 제거됨 (615-699번째 줄)

// 효과음 재생 함수
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

// 메시지 겹침 방지 시스템

// 두 요소가 겹치는지 확인
function isOverlapping(rect1, rect2, margin = 20) {
    return !(rect1.right + margin < rect2.left || 
             rect2.right + margin < rect1.left || 
             rect1.bottom + margin < rect2.top || 
             rect2.bottom + margin < rect1.top);
}

// 기존 메시지들과 겹치지 않는 위치 찾기
function findNonOverlappingPosition(canvas, messageWidth = 320, messageHeight = 100) {
    const canvasRect = canvas.getBoundingClientRect();
    const maxX = canvas.offsetWidth - messageWidth;
    const maxY = canvas.offsetHeight - messageHeight;
    const minY = 30; // 헤더 공간 확보
    
    const existingMessages = canvas.querySelectorAll('.message-container');
    const existingRects = Array.from(existingMessages).map(msg => {
        const rect = msg.getBoundingClientRect();
        return {
            left: parseInt(msg.style.left) || 0,
            top: parseInt(msg.style.top) || 0,
            right: (parseInt(msg.style.left) || 0) + rect.width,
            bottom: (parseInt(msg.style.top) || 0) + rect.height
        };
    });
    
    // 그리드 기반 위치 시도
    const gridSize = 40;
    const cols = Math.floor(maxX / gridSize);
    const rows = Math.floor((maxY - minY) / gridSize);
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = col * gridSize + Math.random() * (gridSize - 20);
            const y = row * gridSize + minY + Math.random() * (gridSize - 20);
            
            const newRect = {
                left: x,
                top: y,
                right: x + messageWidth,
                bottom: y + messageHeight
            };
            
            // 모든 기존 메시지와 겹치지 않는지 확인
            const hasOverlap = existingRects.some(rect => isOverlapping(newRect, rect));
            
            if (!hasOverlap && x >= 0 && y >= minY && x <= maxX && y <= maxY) {
                return { x: Math.round(x), y: Math.round(y) };
            }
        }
    }
    
    // 그리드에서 찾지 못한 경우 나선형 검색
    return findSpiralPosition(canvas, messageWidth, messageHeight, existingRects);
}

// 나선형으로 빈 공간 찾기
function findSpiralPosition(canvas, messageWidth, messageHeight, existingRects) {
    const centerX = canvas.offsetWidth / 2;
    const centerY = canvas.offsetHeight / 2;
    const maxRadius = Math.min(canvas.offsetWidth, canvas.offsetHeight) / 2;
    const step = 30;
    
    for (let radius = step; radius < maxRadius; radius += step) {
        const circumference = 2 * Math.PI * radius;
        const points = Math.max(8, Math.floor(circumference / step));
        
        for (let i = 0; i < points; i++) {
            const angle = (2 * Math.PI * i) / points;
            const x = centerX + radius * Math.cos(angle) - messageWidth / 2;
            const y = centerY + radius * Math.sin(angle) - messageHeight / 2;
            
            if (x < 0 || y < 30 || x + messageWidth > canvas.offsetWidth || y + messageHeight > canvas.offsetHeight) {
                continue;
            }
            
            const newRect = {
                left: x,
                top: y,
                right: x + messageWidth,
                bottom: y + messageHeight
            };
            
            const hasOverlap = existingRects.some(rect => isOverlapping(newRect, rect));
            
            if (!hasOverlap) {
                return { x: Math.round(x), y: Math.round(y) };
            }
        }
    }
    
    // 최후의 수단: 랜덤 위치 (기존 방식)
    return {
        x: Math.random() * (canvas.offsetWidth - messageWidth),
        y: Math.random() * (canvas.offsetHeight - messageHeight - 30) + 30
    };
}

// 드래그 중 실시간 충돌 감지 및 위치 조정
function adjustPositionIfOverlapping(element, canvas) {
    const elementRect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const currentX = parseInt(element.style.left) || 0;
    const currentY = parseInt(element.style.top) || 0;
    
    const otherMessages = canvas.querySelectorAll('.message-container:not([data-message-id="' + element.getAttribute('data-message-id') + '"])');
    
    for (let other of otherMessages) {
        const otherRect = other.getBoundingClientRect();
        
        if (isOverlapping({
            left: currentX,
            top: currentY,
            right: currentX + elementRect.width,
            bottom: currentY + elementRect.height
        }, {
            left: parseInt(other.style.left) || 0,
            top: parseInt(other.style.top) || 0,
            right: (parseInt(other.style.left) || 0) + otherRect.width,
            bottom: (parseInt(other.style.top) || 0) + otherRect.height
        })) {
            // 겹침 발생 시 자동 조정
            const newPosition = findNonOverlappingPosition(canvas, elementRect.width, elementRect.height);
            element.style.left = newPosition.x + 'px';
            element.style.top = newPosition.y + 'px';
            
            // 부드러운 이동 애니메이션
            element.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                element.style.transition = '';
            }, 300);
            
            break;
        }
    }
}

// 모든 메시지 재배치 (대량 메시지 정리용)
function reorganizeAllMessages() {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    const messages = Array.from(canvas.querySelectorAll('.message-container'));
    
    messages.forEach((message, index) => {
        setTimeout(() => {
            const rect = message.getBoundingClientRect();
            const newPosition = findNonOverlappingPosition(canvas, rect.width, rect.height);
            
            message.style.transition = 'all 0.5s ease';
            message.style.left = newPosition.x + 'px';
            message.style.top = newPosition.y + 'px';
            
            setTimeout(() => {
                message.style.transition = '';
            }, 500);
        }, index * 100); // 순차적 애니메이션
    });
}

// 화면 크기 변화 감지 및 자동 재배치
let resizeTimeout;
let lastCanvasSize = { width: 0, height: 0 };

function handleWindowResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const canvas = document.getElementById('messageCanvas');
        if (!canvas) return;
        
        const currentSize = {
            width: canvas.offsetWidth,
            height: canvas.offsetHeight
        };
        
        // 크기가 실제로 변경된 경우에만 재배치
        if (currentSize.width !== lastCanvasSize.width || 
            currentSize.height !== lastCanvasSize.height) {
            
            console.log('화면 크기 변화 감지:', lastCanvasSize, '→', currentSize);
            repositionMessagesForNewSize(currentSize);
            lastCanvasSize = currentSize;
        }
    }, 300); // 300ms 디바운스
}

// 새로운 화면 크기에 맞게 메시지 재배치
function repositionMessagesForNewSize(newSize) {
    const canvas = document.getElementById('messageCanvas');
    const messages = Array.from(canvas.querySelectorAll('.message-container'));
    
    if (messages.length === 0) return;
    
    console.log(`${messages.length}개 메시지를 새 화면 크기에 맞게 재배치 중...`);
    
    // 화면 밖으로 나간 메시지들 찾기
    const outOfBoundsMessages = messages.filter(msg => {
        const x = parseInt(msg.style.left) || 0;
        const y = parseInt(msg.style.top) || 0;
        const rect = msg.getBoundingClientRect();
        
        return x < 0 || y < 30 || 
               x + rect.width > newSize.width || 
               y + rect.height > newSize.height;
    });
    
    console.log(`화면 밖 메시지 ${outOfBoundsMessages.length}개 발견`);
    
    // 비례 축소 방식으로 재배치
    messages.forEach((message, index) => {
        const currentX = parseInt(message.style.left) || 0;
        const currentY = parseInt(message.style.top) || 0;
        const rect = message.getBoundingClientRect();
        
        let newX, newY;
        
        if (outOfBoundsMessages.includes(message)) {
            // 화면 밖 메시지는 새 위치 찾기
            const position = findNonOverlappingPosition(canvas, rect.width, rect.height);
            newX = position.x;
            newY = position.y;
        } else {
            // 화면 안 메시지는 비례 조정
            const scaleX = Math.min(1, (newSize.width - rect.width) / (lastCanvasSize.width - rect.width));
            const scaleY = Math.min(1, (newSize.height - rect.height - 30) / (lastCanvasSize.height - rect.height - 30));
            
            newX = Math.max(0, Math.min(currentX * scaleX, newSize.width - rect.width));
            newY = Math.max(30, Math.min(currentY * scaleY, newSize.height - rect.height));
        }
        
        // 부드러운 애니메이션으로 이동
        setTimeout(() => {
            message.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            message.style.left = newX + 'px';
            message.style.top = newY + 'px';
            
            setTimeout(() => {
                message.style.transition = '';
            }, 500);
        }, index * 50); // 순차적 애니메이션
    });
}

// 퍼센트 기반 위치 저장/복원
function saveMessagePositionsAsPercentages() {
    const canvas = document.getElementById('messageCanvas');
    const messages = canvas.querySelectorAll('.message-container');
    
    messages.forEach(message => {
        const x = parseInt(message.style.left) || 0;
        const y = parseInt(message.style.top) || 0;
        
        const percentX = (x / canvas.offsetWidth) * 100;
        const percentY = (y / canvas.offsetHeight) * 100;
        
        message.dataset.percentX = percentX;
        message.dataset.percentY = percentY;
    });
}

function restoreMessagePositionsFromPercentages() {
    const canvas = document.getElementById('messageCanvas');
    const messages = canvas.querySelectorAll('.message-container');
    
    messages.forEach(message => {
        const percentX = parseFloat(message.dataset.percentX);
        const percentY = parseFloat(message.dataset.percentY);
        
        if (!isNaN(percentX) && !isNaN(percentY)) {
            const x = (percentX / 100) * canvas.offsetWidth;
            const y = (percentY / 100) * canvas.offsetHeight;
            
            message.style.left = Math.max(0, x) + 'px';
            message.style.top = Math.max(30, y) + 'px';
        }
    });
}

// 이벤트 리스너 등록
window.addEventListener('resize', handleWindowResize);
window.addEventListener('orientationchange', () => {
    setTimeout(handleWindowResize, 500); // 모바일 회전 대응
});

// 초기 화면 크기 저장
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const canvas = document.getElementById('messageCanvas');
        if (canvas) {
            lastCanvasSize = {
                width: canvas.offsetWidth,
                height: canvas.offsetHeight
            };
        }
    }, 100);
});
// 화면 크기에 따른 자동 레이아웃 모드
function getOptimalLayoutMode(canvasWidth, canvasHeight) {
    const area = canvasWidth * canvasHeight;
    const messages = document.querySelectorAll('.message-container').length;
    
    if (area < 400000) { // 작은 화면
        return 'compact';
    } else if (area < 800000) { // 중간 화면
        return 'balanced';
    } else { // 큰 화면
        return 'spacious';
    }
}

function applyLayoutMode(mode) {
    const canvas = document.getElementById('messageCanvas');
    
    switch(mode) {
        case 'compact':
            // 조밀한 그리드 배치
            reorganizeMessagesInGrid(30, 25);
            break;
        case 'balanced':
            // 균형잡힌 배치
            reorganizeMessagesInGrid(40, 35);
            break;
        case 'spacious':
            // 여유로운 배치
            reorganizeMessagesInGrid(60, 50);
            break;
    }
}