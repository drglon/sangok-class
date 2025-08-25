const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001; // 3000 → 3001로 변경

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 데이터 저장소
const classrooms = new Map();
const users = new Map();

// 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'teacher.html'));
});

app.get('/teacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'teacher.html'));
});

app.get('/student', (req, res) => {
    res.sendFile(path.join(__dirname, 'student.html'));
});

// API 엔드포인트
app.post('/api/classroom', (req, res) => {
    const { name, teacherName } = req.body;
    
    if (!name || !teacherName) {
        return res.status(400).json({ error: '교실 이름과 선생님 이름이 필요합니다.' });
    }
    
    const classroomId = uuidv4().substring(0, 8).toUpperCase();
    const classroom = {
        id: classroomId,
        name: name,
        teacher: teacherName,
        isOpen: false,
        createdAt: new Date(),
        students: [],
        messages: []
    };
    
    classrooms.set(classroomId, classroom);
    
    res.json({
        success: true,
        classroom: {
            id: classroom.id,
            name: classroom.name,
            teacher: classroom.teacher,
            isOpen: classroom.isOpen
        }
    });
});

app.get('/api/classroom/:id', (req, res) => {
    const classroomId = req.params.id.toUpperCase();
    const classroom = classrooms.get(classroomId);
    
    if (!classroom) {
        return res.status(404).json({ error: '교실을 찾을 수 없습니다.' });
    }
    
    res.json({
        success: true,
        classroom: {
            id: classroom.id,
            name: classroom.name,
            teacher: classroom.teacher,
            isOpen: classroom.isOpen,
            studentCount: classroom.students.length
        }
    });
});

// Socket.IO 연결 처리
io.on('connection', (socket) => {
    console.log('사용자 연결:', socket.id);
    
    // 교실 생성
    socket.on('createClassroom', (data) => {
        const { classroomName, teacherName } = data;
        
        if (!classroomName || !teacherName) {
            socket.emit('error', { message: '교실 이름과 선생님 이름이 필요합니다.' });
            return;
        }
        
        // 2자리 랜덤 숫자 생성 (10-99)
        let classroomId;
        do {
            classroomId = Math.floor(Math.random() * 90 + 10).toString();
        } while (classrooms.has(classroomId)); // 중복 방지
        
        const classroom = {
            id: classroomId,
            name: classroomName,
            teacher: teacherName,
            isOpen: false,
            createdAt: new Date(),
            students: [],
            messages: []
        };
        
        classrooms.set(classroomId, classroom);
        
        const teacher = {
            id: socket.id,
            name: teacherName,
            role: 'teacher',
            classroomId: classroomId
        };
        
        users.set(socket.id, teacher);
        socket.join(classroomId);
        
        socket.emit('classroomCreated', {  // joinResult → classroomCreated
            success: true,
            classroom: classroom,
            user: teacher,
            messages: classroom.messages
        });
    });
    
    // 교실 입장
    socket.on('joinClassroom', (data) => {
        const { classroomId, name, role } = data;
        const upperClassroomId = classroomId.toUpperCase();
        const classroom = classrooms.get(upperClassroomId);
        
        if (!classroom) {
            socket.emit('joinResult', {
                success: false,
                message: '존재하지 않는 교실입니다.'
            });
            return;
        }
        
        if (role === 'student' && !classroom.isOpen) {
            socket.emit('joinResult', {
                success: false,
                message: '교실이 아직 열리지 않았습니다.'
            });
            return;
        }
        
        // 사용자 정보 생성
        const user = {
            id: socket.id,
            name: name,
            role: role,
            classroomId: upperClassroomId,
            joinedAt: new Date()
        };
        
        users.set(socket.id, user);
        socket.join(upperClassroomId);
        
        // 학생인 경우 교실에 추가
        if (role === 'student') {
            classroom.students.push(user);
        }
        
        // 입장 성공 응답
        socket.emit('joinResult', {
            success: true,
            classroom: classroom,
            user: user,
            messages: classroom.messages
        });
        
        // 다른 사용자들에게 입장 알림
        socket.to(upperClassroomId).emit('userJoined', {
            name: user.name,
            role: user.role
        });
        
        console.log(`${name}(${role})이 교실 ${classroom.name}에 입장했습니다.`);
    });
    
    // 교실 열기/닫기
    socket.on('toggleClassroom', (data) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 교실을 열고 닫을 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) {
            socket.emit('error', { message: '교실을 찾을 수 없습니다.' });
            return;
        }
        
        classroom.isOpen = !classroom.isOpen;
        
        // 모든 사용자에게 교실 상태 변경 알림
        io.to(user.classroomId).emit(classroom.isOpen ? 'classroomOpened' : 'classroomClosed');
        
        console.log(`교실 ${classroom.name}이 ${classroom.isOpen ? '열렸습니다' : '닫혔습니다'}.`);
    });
    
    // 메시지 전송
    socket.on('sendMessage', (data) => {
        const user = users.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: '로그인이 필요합니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) {
            socket.emit('error', { message: '교실을 찾을 수 없습니다.' });
            return;
        }
        
        if (!classroom.isOpen && user.role === 'student') {
            socket.emit('error', { message: '교실이 닫혀있습니다.' });
            return;
        }
        
        const message = {
            id: uuidv4(),
            sender: user.name,
            role: user.role,
            message: data.message,
            timestamp: new Date(),
            x: Math.random() * 500,
            y: Math.random() * 300,
            hidden: false
        };
        
        classroom.messages.push(message);
        
        // 모든 사용자에게 메시지 전송
        io.to(user.classroomId).emit('newMessage', message);
        
        console.log(`${user.name}: ${data.message}`);
    });
    
    // 메시지 위치 업데이트
    socket.on('updateMessagePosition', (data) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 메시지를 이동할 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) return;
        
        const message = classroom.messages.find(m => m.id === data.messageId);
        if (message) {
            message.x = data.x;
            message.y = data.y;
            
            // 다른 사용자들에게 위치 업데이트 전송
            socket.to(user.classroomId).emit('messageUpdated', {
                id: message.id,
                x: message.x,
                y: message.y
            });
        }
    });
    
    // 메시지 가시성 토글
    socket.on('toggleMessageVisibility', (data) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 메시지를 숨길 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) return;
        
        const message = classroom.messages.find(m => m.id === data.messageId);
        if (message) {
            message.hidden = data.hidden;
            
            // 모든 사용자에게 가시성 변경 전송
            io.to(user.classroomId).emit('messageUpdated', {
                id: message.id,
                hidden: message.hidden
            });
        }
    });
    
    // 메시지 삭제
    socket.on('deleteMessage', (data) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 메시지를 삭제할 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) return;
        
        const messageIndex = classroom.messages.findIndex(m => m.id === data.messageId);
        if (messageIndex !== -1) {
            classroom.messages.splice(messageIndex, 1);
            
            // 모든 사용자에게 삭제 알림
            io.to(user.classroomId).emit('messageDeleted', {
                messageId: data.messageId
            });
        }
    });
    
    // 연결 해제
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        
        if (user) {
            const classroom = classrooms.get(user.classroomId);
            
            if (classroom) {
                // 학생인 경우 교실에서 제거
                if (user.role === 'student') {
                    const studentIndex = classroom.students.findIndex(s => s.id === socket.id);
                    if (studentIndex !== -1) {
                        classroom.students.splice(studentIndex, 1);
                    }
                }
                
                // 다른 사용자들에게 퇴장 알림
                socket.to(user.classroomId).emit('userLeft', {
                    name: user.name,
                    role: user.role
                });
            }
            
            users.delete(socket.id);
            console.log(`${user.name}이 연결을 해제했습니다.`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`📚 선생님용: http://localhost:${PORT}/teacher.html`);
    console.log(`👨‍🎓 학생용: http://localhost:${PORT}/student.html`);
});