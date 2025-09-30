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
    
    // 학생 페이지에서는 메시지 전송 기능 없음
    // 교실 입장 폼 이벤트 리스너
    const joinForm = document.getElementById('joinForm');
    if (joinForm) {
        joinForm.addEventListener('submit', function(e) {
            e.preventDefault();
            joinClassroom();
        });
    }
    
    // 교실 코드 입력 필드에서 Enter 키 처리
    const classroomCodeInput = document.getElementById('classroomCode');
    if (classroomCodeInput) {
        classroomCodeInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                joinClassroom();
            }
        });
    }
}

// 교실 생성 (선생님만)
function createClassroom() {
    if (currentRole !== 'teacher') return;
    
    const classroomName = document.getElementById('classroomName').value.trim() || '인터랙티브 교실';
    const teacherName = document.getElementById('teacherName').value.trim() || '선생님';
    
    console.log('교실 생성 시도:', { name: classroomName, teacherName: teacherName });
    console.log('Socket 연결 상태:', socket.connected);
    
    socket.emit('createClassroom', {
        name: classroomName,
        teacherName: teacherName
    });
    
    console.log('createClassroom 이벤트 전송 완료');
    
    // 버튼 상태 변경
    const createBtn = document.getElementById('createClassroomBtn');
    if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = '교실 생성 중...';
    }
}

// 교실 입장 (학생만)
function joinClassroom() {
    if (currentRole !== 'student') return;
    
    const classroomCode = document.getElementById('classroomCode').value.trim();
    const studentName = document.getElementById('studentName').value.trim();
    
    if (!classroomCode || !studentName) {
        alert('교실 코드와 이름을 모두 입력해주세요.');
        return;
    }
    
    socket.emit('joinClassroom', {
        classroomCode: classroomCode,
        studentName: studentName
    });
}

// 교실 열기/닫기 토글 (선생님만)
function toggleClassroom() {
    if (currentRole !== 'teacher' || !currentClassroom) return;
    
    socket.emit('toggleClassroom', {
        classroomCode: currentClassroom.code
    });
}

// 메시지 전송 (선생님만)
function sendMessage() {
    if (currentRole !== 'teacher' || !currentClassroom) return;
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    socket.emit('sendMessage', {
        classroomCode: currentClassroom.code,
        message: message
    });
    
    messageInput.value = '';
}

// 소켓 이벤트 리스너 설정
function setupSocketListeners() {
    // 연결 상태
    socket.on('connect', () => {
        console.log('서버에 연결됨');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
        console.log('서버 연결 끊김');
        updateConnectionStatus(false);
    });
    
    // 교실 생성 성공
    socket.on('classroomCreated', (data) => {
        console.log('교실 생성됨:', data);
        currentClassroom = data.classroom;
        updateClassroomInfo(data.classroom);
        showClassroomControls();
    });
    
    // 교실 입장 성공
    socket.on('joinedClassroom', (data) => {
        console.log('교실 입장 성공:', data);
        currentClassroom = data.classroom;
        currentUser = data.user;
        updateStudentInterface(data.classroom);
        
        // 기존 메시지들 표시
        if (data.classroom.messages) {
            data.classroom.messages.forEach(message => {
                if (message.isVisible) {
                    addMessageToCanvas(message);
                }
            });
        }
    });
    
    // 교실 상태 변경
    socket.on('classroomStatusChanged', (data) => {
        console.log('교실 상태 변경:', data);
        if (currentClassroom) {
            currentClassroom.isOpen = data.isOpen;
            updateClassroomStatus(data.isOpen);
        }
    });
    
    // 새 메시지 수신
    socket.on('newMessage', (messageData) => {
        console.log('새 메시지:', messageData);
        addMessageToCanvas(messageData);
    });
    
    // 메시지 위치 업데이트
    socket.on('messagePositionUpdated', (data) => {
        const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (messageElement) {
            messageElement.style.left = data.position.x + 'px';
            messageElement.style.top = data.position.y + 'px';
        }
    });
    
    // 메시지 가시성 변경
    socket.on('messageVisibilityChanged', (data) => {
        if (data.isVisible) {
            // 메시지 표시
            if (!document.querySelector(`[data-message-id="${data.messageId}"]`)) {
                addMessageToCanvas(data.message);
            }
        } else {
            // 메시지 숨기기
            removeMessageFromCanvas(data.messageId);
        }
    });
    
    // 메시지 삭제
    socket.on('messageDeleted', (data) => {
        removeMessageFromCanvas(data.messageId);
    });
    
    // 에러 처리
    socket.on('error', (error) => {
        console.error('소켓 에러:', error);
        alert(error.message || '오류가 발생했습니다.');
    });
}

// 연결 상태 업데이트
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        if (isConnected) {
            statusElement.textContent = '연결됨';
            statusElement.className = 'status connected';
        } else {
            statusElement.textContent = '연결 끊김';
            statusElement.className = 'status disconnected';
        }
    }
}

// 교실 정보 업데이트 (선생님)
function updateClassroomInfo(classroom) {
    const codeElement = document.getElementById('classroomCode');
    const studentsElement = document.getElementById('studentCount');
    
    if (codeElement) {
        codeElement.textContent = classroom.code;
    }
    
    if (studentsElement) {
        studentsElement.textContent = classroom.students ? classroom.students.length : 0;
    }
    
    updateClassroomStatus(classroom.isOpen);
}

// 교실 컨트롤 표시
function showClassroomControls() {
    const controls = document.getElementById('classroomControls');
    if (controls) {
        controls.style.display = 'block';
    }
}

// 교실 상태 업데이트
function updateClassroomStatus(isOpen) {
    const statusElement = document.getElementById('classroomStatus');
    const toggleBtn = document.getElementById('toggleClassroomBtn');
    
    if (statusElement) {
        statusElement.textContent = isOpen ? '열림' : '닫힘';
        statusElement.className = isOpen ? 'status open' : 'status closed';
    }
    
    if (toggleBtn) {
        toggleBtn.textContent = isOpen ? '교실 닫기' : '교실 열기';
    }
}

// 학생 인터페이스 업데이트
function updateStudentInterface(classroom) {
    const joinSection = document.getElementById('joinSection');
    const classroomSection = document.getElementById('classroomSection');
    
    if (joinSection) joinSection.style.display = 'none';
    if (classroomSection) classroomSection.style.display = 'block';
    
    document.getElementById('currentClassroomCode').textContent = classroom.code;
}

// 메시지를 캔버스에 추가
function addMessageToCanvas(messageData) {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    // 이미 존재하는 메시지인지 확인
    if (document.querySelector(`[data-message-id="${messageData.id}"]`)) {
        return;
    }
    
    const messageElement = createMessageElement(messageData);
    canvas.appendChild(messageElement);
}

// 메시지 요소 생성
function createMessageElement(messageData) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.setAttribute('data-message-id', messageData.id);
    
    // 위치 설정
    if (messageData.position) {
        messageDiv.style.left = messageData.position.x + 'px';
        messageDiv.style.top = messageData.position.y + 'px';
    } else {
        // 겹치지 않는 위치 찾기
        const canvas = document.getElementById('messageCanvas');
        const position = findNonOverlappingPosition(canvas);
        messageDiv.style.left = position.x + 'px';
        messageDiv.style.top = position.y + 'px';
    }
    
    // 메시지 내용
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = escapeHtml(messageData.message).replace(/\n/g, '<br>');
    
    // 메시지 시간
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = formatTime(messageData.timestamp);
    
    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(messageTime);
    
    // 선생님만 드래그 및 클릭 이벤트 추가
    if (currentRole === 'teacher') {
        messageDiv.draggable = true;
        messageDiv.addEventListener('mousedown', handleMouseDown);
        messageDiv.addEventListener('click', handleMessageClick);
        messageDiv.addEventListener('dblclick', handleMessageDoubleClick);
        
        // 드래그 이벤트
        messageDiv.addEventListener('dragstart', function(e) {
            e.dataTransfer.effectAllowed = 'move';
            selectedMessage = messageDiv;
        });
        
        messageDiv.addEventListener('dragend', function(e) {
            // 드래그 종료 후 정리
        });
    }
    
    return messageDiv;
}

// 마우스 다운 이벤트 처리
function handleMouseDown(e) {
    if (currentRole !== 'teacher') return;
    
    const messageElement = e.currentTarget;
    
    // 메시지 선택
    selectMessage(messageElement);
    
    // 드래그 시작 준비
    isMouseDragging = true;
    mouseStartPos = { x: e.clientX, y: e.clientY };
    
    const rect = messageElement.getBoundingClientRect();
    const canvas = document.getElementById('messageCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    elementStartPos = {
        x: rect.left - canvasRect.left,
        y: rect.top - canvasRect.top
    };
    
    // 드래그 가이드라인 표시
    showDragGuidelines();
    
    e.preventDefault();
}

// 전역 마우스 이동 이벤트 처리
function handleGlobalMouseMove(e) {
    if (!isMouseDragging || !selectedMessage || currentRole !== 'teacher') return;
    
    const deltaX = e.clientX - mouseStartPos.x;
    const deltaY = e.clientY - mouseStartPos.y;
    
    // 최소 이동 거리 체크 (드래그 시작)
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        isDragging = true;
        
        const newX = elementStartPos.x + deltaX;
        const newY = elementStartPos.y + deltaY;
        
        // 캔버스 경계 체크
        const canvas = document.getElementById('messageCanvas');
        const canvasRect = canvas.getBoundingClientRect();
        const messageRect = selectedMessage.getBoundingClientRect();
        
        const maxX = canvasRect.width - messageRect.width;
        const maxY = canvasRect.height - messageRect.height;
        
        const constrainedX = Math.max(0, Math.min(newX, maxX));
        const constrainedY = Math.max(0, Math.min(newY, maxY));
        
        selectedMessage.style.left = constrainedX + 'px';
        selectedMessage.style.top = constrainedY + 'px';
        
        // 겹침 체크 및 조정
        adjustPositionIfOverlapping(selectedMessage, canvas);
    }
}

// 전역 마우스 업 이벤트 처리
function handleGlobalMouseUp(e) {
    if (isMouseDragging && selectedMessage && currentRole === 'teacher') {
        if (isDragging) {
            // 드래그가 실제로 발생한 경우에만 위치 업데이트
            const messageId = selectedMessage.getAttribute('data-message-id');
            const rect = selectedMessage.getBoundingClientRect();
            const canvas = document.getElementById('messageCanvas');
            const canvasRect = canvas.getBoundingClientRect();
            
            const position = {
                x: rect.left - canvasRect.left,
                y: rect.top - canvasRect.top
            };
            
            updateMessagePosition(messageId, position);
            
            // 드래그 가이드라인 숨기기
            hideDragGuidelines();
            
            // 위치 저장
            saveMessagePositionsAsPercentages();
        }
    }
    
    // 드래그 상태 초기화
    isMouseDragging = false;
    isDragging = false;
    mouseStartPos = { x: 0, y: 0 };
    elementStartPos = { x: 0, y: 0 };
}

// 캔버스 마우스 이동 이벤트
function handleCanvasMouseMove(e) {
    // 현재는 전역 이벤트로 처리
}

function handleCanvasMouseUp(e) {
    // 현재는 전역 이벤트로 처리
}

// 캔버스 마우스 리브 이벤트
function handleCanvasMouseLeave(e) {
    if (isMouseDragging) {
        // 캔버스를 벗어나면 드래그 종료
        handleGlobalMouseUp(e);
    }
}

// 메시지 더블클릭 이벤트 (가시성 토글)
function handleMessageDoubleClick(e) {
    if (currentRole !== 'teacher') return;
    
    e.stopPropagation();
    const messageElement = e.currentTarget;
    const messageId = messageElement.getAttribute('data-message-id');
    
    // 현재 가시성 상태 토글
    const isCurrentlyVisible = !messageElement.classList.contains('hidden');
    toggleMessageVisibility(messageId, !isCurrentlyVisible);
}

// 메시지 클릭 이벤트
function handleMessageClick(e) {
    if (currentRole !== 'teacher') return;
    
    e.stopPropagation();
    const messageElement = e.currentTarget;
    selectMessage(messageElement);
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
    if (e.key === 'Delete' && selectedMessage && currentRole === 'teacher') {
        const messageId = selectedMessage.getAttribute('data-message-id');
        deleteMessage(messageId);
    }
}

// 메시지 삭제
function deleteMessage(messageId) {
    if (currentRole !== 'teacher') return;
    
    socket.emit('deleteMessage', {
        classroomCode: currentClassroom.code,
        messageId: messageId
    });
}

// 메시지 위치 업데이트
function updateMessagePosition(messageId, position) {
    socket.emit('updateMessagePosition', {
        classroomCode: currentClassroom.code,
        messageId: messageId,
        position: position
    });
}

// 메시지 가시성 토글
function toggleMessageVisibility(messageId, isVisible) {
    socket.emit('toggleMessageVisibility', {
        classroomCode: currentClassroom.code,
        messageId: messageId,
        isVisible: isVisible
    });
    
    // 로컬에서 즉시 반영
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.classList.toggle('hidden', !isVisible);
    }
}

// 캔버스에서 메시지 제거
function removeMessageFromCanvas(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        if (selectedMessage === messageElement) {
            deselectMessage();
        }
        messageElement.remove();
    }
}

// 드래그 가이드라인 표시
function showDragGuidelines() {
    // 필요시 구현
}

// 드래그 가이드라인 숨기기
function hideDragGuidelines() {
    // 필요시 구현
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
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// 휴지통 사운드 재생 (호버)
function playTrashSound() {
    try {
        // 간단한 비프음 생성
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.log('오디오 재생 실패:', error);
    }
}

// 휴지통 드롭 사운드 재생
function playTrashDropSound() {
    try {
        // 더 복잡한 사운드 생성 (휴지통에 떨어지는 소리)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 첫 번째 톤 (높은 주파수)
        const oscillator1 = audioContext.createOscillator();
        const gainNode1 = audioContext.createGain();
        
        oscillator1.connect(gainNode1);
        gainNode1.connect(audioContext.destination);
        
        oscillator1.frequency.setValueAtTime(1200, audioContext.currentTime);
        oscillator1.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        oscillator1.type = 'square';
        
        gainNode1.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode1.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01);
        gainNode1.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
        
        // 두 번째 톤 (낮은 주파수)
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        
        oscillator2.frequency.setValueAtTime(300, audioContext.currentTime + 0.05);
        oscillator2.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.2);
        oscillator2.type = 'sawtooth';
        
        gainNode2.gain.setValueAtTime(0, audioContext.currentTime + 0.05);
        gainNode2.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.06);
        gainNode2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.25);
        
        oscillator1.start(audioContext.currentTime);
        oscillator1.stop(audioContext.currentTime + 0.15);
        
        oscillator2.start(audioContext.currentTime + 0.05);
        oscillator2.stop(audioContext.currentTime + 0.25);
    } catch (error) {
        console.log('오디오 재생 실패:', error);
    }
}

// 겹침 체크 함수
function isOverlapping(rect1, rect2, margin = 20) {
    return !(rect1.right + margin < rect2.left || 
             rect1.left - margin > rect2.right || 
             rect1.bottom + margin < rect2.top || 
             rect1.top - margin > rect2.bottom);
}

// 겹치지 않는 위치 찾기
function findNonOverlappingPosition(canvas, messageWidth = 320, messageHeight = 100) {
    const canvasRect = canvas.getBoundingClientRect();
    const existingMessages = canvas.querySelectorAll('.message');
    
    // 기존 메시지들의 위치 정보 수집
    const existingRects = Array.from(existingMessages).map(msg => {
        const rect = msg.getBoundingClientRect();
        return {
            left: rect.left - canvasRect.left,
            top: rect.top - canvasRect.top,
            right: rect.left - canvasRect.left + rect.width,
            bottom: rect.top - canvasRect.top + rect.height
        };
    });
    
    // 그리드 기반으로 위치 찾기
    const gridSize = 50;
    const maxX = canvasRect.width - messageWidth;
    const maxY = canvasRect.height - messageHeight;
    
    for (let y = 20; y <= maxY; y += gridSize) {
        for (let x = 20; x <= maxX; x += gridSize) {
            const testRect = {
                left: x,
                top: y,
                right: x + messageWidth,
                bottom: y + messageHeight
            };
            
            // 기존 메시지와 겹치는지 확인
            const hasOverlap = existingRects.some(existing => 
                isOverlapping(testRect, existing)
            );
            
            if (!hasOverlap) {
                return { x, y };
            }
        }
    }
    
    // 적절한 위치를 찾지 못한 경우 나선형으로 배치
    return findSpiralPosition(canvas, messageWidth, messageHeight, existingRects);
}

// 나선형 위치 찾기
function findSpiralPosition(canvas, messageWidth, messageHeight, existingRects) {
    const canvasRect = canvas.getBoundingClientRect();
    const centerX = canvasRect.width / 2;
    const centerY = canvasRect.height / 2;
    
    let radius = 50;
    let angle = 0;
    const angleIncrement = 0.5;
    const radiusIncrement = 2;
    
    while (radius < Math.max(canvasRect.width, canvasRect.height)) {
        const x = centerX + radius * Math.cos(angle) - messageWidth / 2;
        const y = centerY + radius * Math.sin(angle) - messageHeight / 2;
        
        // 캔버스 경계 체크
        if (x >= 0 && y >= 0 && x + messageWidth <= canvasRect.width && y + messageHeight <= canvasRect.height) {
            const testRect = {
                left: x,
                top: y,
                right: x + messageWidth,
                bottom: y + messageHeight
            };
            
            // 겹침 체크
            const hasOverlap = existingRects.some(existing => 
                isOverlapping(testRect, existing)
            );
            
            if (!hasOverlap) {
                return { x, y };
            }
        }
        
        angle += angleIncrement;
        radius += radiusIncrement;
    }
    
    // 최후의 수단: 랜덤 위치
    return {
        x: Math.random() * (canvasRect.width - messageWidth),
        y: Math.random() * (canvasRect.height - messageHeight)
    };
}

// 겹침 조정 함수
function adjustPositionIfOverlapping(element, canvas) {
    const elementRect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const otherMessages = canvas.querySelectorAll('.message:not([data-message-id="' + element.getAttribute('data-message-id') + '"])');
    
    const currentRect = {
        left: elementRect.left - canvasRect.left,
        top: elementRect.top - canvasRect.top,
        right: elementRect.left - canvasRect.left + elementRect.width,
        bottom: elementRect.top - canvasRect.top + elementRect.height
    };
    
    // 다른 메시지들과 겹치는지 확인
    for (let otherMsg of otherMessages) {
        const otherRect = otherMsg.getBoundingClientRect();
        const otherRelativeRect = {
            left: otherRect.left - canvasRect.left,
            top: otherRect.top - canvasRect.top,
            right: otherRect.left - canvasRect.left + otherRect.width,
            bottom: otherRect.top - canvasRect.top + otherRect.height
        };
        
        if (isOverlapping(currentRect, otherRelativeRect, 10)) {
            // 겹치는 경우 위치 조정
            const newX = otherRelativeRect.right + 10;
            const newY = currentRect.top;
            
            // 캔버스 경계 체크
            if (newX + elementRect.width <= canvasRect.width) {
                element.style.left = newX + 'px';
            } else {
                element.style.left = '20px';
                element.style.top = (otherRelativeRect.bottom + 10) + 'px';
            }
            break;
        }
    }
}

// 모든 메시지 재정렬
function reorganizeAllMessages() {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    const messages = Array.from(canvas.querySelectorAll('.message'));
    const canvasRect = canvas.getBoundingClientRect();
    
    messages.forEach((message, index) => {
        const position = findNonOverlappingPosition(canvas);
        message.style.left = position.x + 'px';
        message.style.top = position.y + 'px';
        
        // 위치 업데이트 서버에 전송
        const messageId = message.getAttribute('data-message-id');
        if (messageId && currentRole === 'teacher') {
            updateMessagePosition(messageId, position);
        }
    });
    
    // 위치 저장
    saveMessagePositionsAsPercentages();
}

// 윈도우 리사이즈 관련 변수
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
        
        // 크기가 실제로 변경된 경우에만 처리
        if (currentSize.width !== lastCanvasSize.width || 
            currentSize.height !== lastCanvasSize.height) {
            
            repositionMessagesForNewSize(currentSize);
            lastCanvasSize = currentSize;
        }
    }, 250);
}

// 새로운 크기에 맞게 메시지 재배치
function repositionMessagesForNewSize(newSize) {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    const messages = canvas.querySelectorAll('.message');
    
    messages.forEach(message => {
        const currentLeft = parseInt(message.style.left) || 0;
        const currentTop = parseInt(message.style.top) || 0;
        const messageRect = message.getBoundingClientRect();
        
        // 캔버스 경계를 벗어나는 메시지 조정
        let newLeft = currentLeft;
        let newTop = currentTop;
        
        // 오른쪽 경계 체크
        if (currentLeft + messageRect.width > newSize.width) {
            newLeft = Math.max(0, newSize.width - messageRect.width);
        }
        
        // 하단 경계 체크
        if (currentTop + messageRect.height > newSize.height) {
            newTop = Math.max(0, newSize.height - messageRect.height);
        }
        
        // 위치가 변경된 경우에만 업데이트
        if (newLeft !== currentLeft || newTop !== currentTop) {
            message.style.left = newLeft + 'px';
            message.style.top = newTop + 'px';
            
            // 서버에 위치 업데이트 전송
            const messageId = message.getAttribute('data-message-id');
            if (messageId && currentRole === 'teacher') {
                updateMessagePosition(messageId, { x: newLeft, y: newTop });
            }
        }
    });
    
    // 겹침 해결
    messages.forEach(message => {
        adjustPositionIfOverlapping(message, canvas);
    });
    
    // 위치 저장
    saveMessagePositionsAsPercentages();
}

// 메시지 위치를 백분율로 저장
function saveMessagePositionsAsPercentages() {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    const messages = canvas.querySelectorAll('.message');
    const canvasRect = canvas.getBoundingClientRect();
    
    messages.forEach(message => {
        const messageRect = message.getBoundingClientRect();
        const percentX = ((messageRect.left - canvasRect.left) / canvasRect.width) * 100;
        const percentY = ((messageRect.top - canvasRect.top) / canvasRect.height) * 100;
        
        message.setAttribute('data-percent-x', percentX);
        message.setAttribute('data-percent-y', percentY);
    });
}

function restoreMessagePositionsFromPercentages() {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    const messages = canvas.querySelectorAll('.message');
    const canvasRect = canvas.getBoundingClientRect();
    
    messages.forEach(message => {
        const percentX = parseFloat(message.getAttribute('data-percent-x'));
        const percentY = parseFloat(message.getAttribute('data-percent-y'));
        
        if (!isNaN(percentX) && !isNaN(percentY)) {
            const newX = (percentX / 100) * canvasRect.width;
            const newY = (percentY / 100) * canvasRect.height;
            
            message.style.left = newX + 'px';
            message.style.top = newY + 'px';
        }
    });
}

// 이벤트 리스너 등록
window.addEventListener('resize', handleWindowResize);
window.addEventListener('orientationchange', () => {
    setTimeout(handleWindowResize, 100);
});

// 페이지 로드 완료 후 초기 크기 저장
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

// 레이아웃 모드 결정
function getOptimalLayoutMode(canvasWidth, canvasHeight) {
    const aspectRatio = canvasWidth / canvasHeight;
    
    if (aspectRatio > 1.5) {
        return 'horizontal';
    } else if (aspectRatio < 0.8) {
        return 'vertical';
    } else {
        return 'grid';
    }
}

function applyLayoutMode(mode) {
    const canvas = document.getElementById('messageCanvas');
    if (!canvas) return;
    
    canvas.setAttribute('data-layout-mode', mode);
    
    // CSS에서 레이아웃 모드에 따른 스타일 적용
    // 예: .message-canvas[data-layout-mode="horizontal"] .message { ... }
}