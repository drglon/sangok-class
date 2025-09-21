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

const PORT = process.env.PORT || 3007; // V4 버전은 3007 포트 사용

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 데이터 저장소
const classrooms = new Map();
const users = new Map();

// 라우트 - V4 파일들을 참조하도록 수정
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'student-v4.html'));
});

app.get('/teacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'teacher-v4.html'));
});

app.get('/student', (req, res) => {
    res.sendFile(path.join(__dirname, 'student-v4.html'));
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
        students: [],
        messages: [],
        isActive: true,
        createdAt: new Date()
    };
    
    classrooms.set(classroomId, classroom);
    
    res.json({
        success: true,
        classroom: {
            id: classroomId,
            name: name,
            teacher: teacherName,
            isActive: true
        }
    });
});

app.get('/api/classroom/:id', (req, res) => {
    const classroomId = req.params.id;
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
            studentCount: classroom.students.length,
            isActive: classroom.isActive
        }
    });
});

// Socket.IO 연결 처리
io.on('connection', (socket) => {
    console.log('사용자 연결:', socket.id);
    
    // 교실 생성
    // 현재 잘못된 로직
    socket.on('createClassroom', (data) => {
        console.log('createClassroom 이벤트 수신:', data);
        const { name, teacherName } = data;
        
        // 교실 ID 생성
        const classroomId = uuidv4().substring(0, 8).toUpperCase();
        console.log('생성된 교실 ID:', classroomId);
        
        // 새 교실 생성
        const classroom = {
            id: classroomId,
            name: name,
            teacher: teacherName,
            students: [],
            messages: [],
            isActive: true,
            createdAt: new Date()
        };
        
        classrooms.set(classroomId, classroom);
        
        // 선생님 정보 저장
        users.set(socket.id, {
            name: teacherName,
            role: 'teacher',
            classroomId: classroomId
        });
        
        // 교실 참가
        socket.join(classroomId);
        
        // 교실 생성 성공 응답
        socket.emit('classroomCreated', {
            classroom: {
                id: classroom.id,
                name: classroom.name,
                teacher: classroom.teacher,
                students: classroom.students,
                messages: classroom.messages,
                isActive: classroom.isActive
            },
            role: 'teacher'
        });
        
        console.log(`선생님 ${teacherName}이 교실 ${classroomId}(${name})을 생성했습니다.`);
    });
    
    // 교실 입장
    socket.on('joinClassroom', (data) => {
        const { classroomId, studentName } = data;
        
        const classroom = classrooms.get(classroomId);
        
        if (!classroom) {
            socket.emit('error', { message: '존재하지 않는 교실입니다.' });
            return;
        }
        
        if (!classroom.isActive) {
            socket.emit('error', { message: '현재 비활성화된 교실입니다.' });
            return;
        }
        
        // 학생 정보 저장
        const student = {
            id: socket.id,
            name: studentName,
            joinedAt: new Date()
        };
        
        users.set(socket.id, {
            name: studentName,
            role: 'student',
            classroomId: classroomId
        });
        
        classroom.students.push(student);
        
        // 교실 참가
        socket.join(classroomId);
        
        // 학생에게 교실 정보 전송
        socket.emit('classroomJoined', {
            classroom: {
                id: classroom.id,
                name: classroom.name,
                teacher: classroom.teacher,
                students: classroom.students,
                messages: classroom.messages.filter(m => !m.hidden),
                isActive: classroom.isActive
            },
            role: 'student'
        });
        
        // 다른 사용자들에게 새 학생 입장 알림
        socket.to(classroomId).emit('studentJoined', {
            student: student,
            totalStudents: classroom.students.length
        });
        
        console.log(`학생 ${studentName}이 교실 ${classroomId}에 입장했습니다.`);
    });
    
    // 교실 상태 변경 (활성화/비활성화)
    socket.on('toggleClassroom', (data) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 교실 상태를 변경할 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) return;
        
        classroom.isActive = data.isActive;
        
        // 모든 사용자에게 상태 변경 알림
        io.to(user.classroomId).emit('classroomStatusChanged', {
            isActive: classroom.isActive
        });
        
        console.log(`교실 ${user.classroomId} 상태가 ${classroom.isActive ? '활성화' : '비활성화'}되었습니다.`);
    });
    
    // 메시지 전송
    socket.on('sendMessage', (data) => {
        const user = users.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: '인증되지 않은 사용자입니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) return;
        
        const message = {
            id: uuidv4(),
            text: data.text,
            author: user.name,
            role: user.role,
            x: data.x || 100,
            y: data.y || 100,
            timestamp: new Date(),
            hidden: false
        };
        
        classroom.messages.push(message);
        
        // 모든 사용자에게 메시지 전송 (학생들에게는 숨겨진 메시지 제외)
        if (user.role === 'teacher') {
            // 선생님이 보낸 메시지는 모든 사용자에게
            io.to(user.classroomId).emit('newMessage', message);
        } else {
            // 학생이 보낸 메시지는 선생님에게만
            const teacherSockets = Array.from(users.entries())
                .filter(([socketId, userData]) => 
                    userData.classroomId === user.classroomId && userData.role === 'teacher'
                )
                .map(([socketId]) => socketId);
            
            teacherSockets.forEach(teacherSocketId => {
                io.to(teacherSocketId).emit('newMessage', message);
            });
        }
        
        console.log(`${user.role} ${user.name}이 메시지를 보냈습니다: ${data.text}`);
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
    console.log(`🚀 V4 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`📚 선생님용: http://localhost:${PORT}/teacher-v4.html`);
    console.log(`👨‍🎓 학생용: http://localhost:${PORT}/student-v4.html`);
});