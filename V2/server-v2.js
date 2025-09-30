const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3002; // v2는 3002 포트 사용

// 업로드 디렉토리 생성
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer 설정 (파일 업로드)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB 제한
    },
    fileFilter: function (req, file, cb) {
        // 허용되는 파일 타입
        const allowedTypes = /jpeg|jpg|png|gif|pdf|ppt|pptx|mp4|avi|mov|wmv/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('지원되지 않는 파일 형식입니다.'));
        }
    }
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsDir));

// 데이터 저장소
const classrooms = new Map();
const users = new Map();

// 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'student-v2.html'));
});

app.get('/teacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'teacher-v2.html'));
});

app.get('/student', (req, res) => {
    res.sendFile(path.join(__dirname, 'student-v2.html'));
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
        messages: [],
        materials: [] // 수업자료 배열 추가
    };
    
    classrooms.set(classroomId, classroom);
    
    res.json({
        success: true,
        classroom: classroom
    });
});

// 파일 업로드 엔드포인트
app.post('/api/upload/:classroomId', upload.single('file'), (req, res) => {
    try {
        const { classroomId } = req.params;
        const classroom = classrooms.get(classroomId.toUpperCase());
        
        if (!classroom) {
            return res.status(404).json({ error: '교실을 찾을 수 없습니다.' });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
        }
        
        const material = {
            id: uuidv4(),
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: new Date(),
            order: classroom.materials.length
        };
        
        classroom.materials.push(material);
        
        // 모든 사용자에게 새 자료 알림
        io.to(classroomId.toUpperCase()).emit('materialAdded', material);
        
        res.json({
            success: true,
            material: material
        });
    } catch (error) {
        console.error('파일 업로드 오류:', error);
        res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
    }
});

// YouTube 링크 추가 엔드포인트
app.post('/api/youtube/:classroomId', (req, res) => {
    try {
        const { classroomId } = req.params;
        const { url, title } = req.body;
        const classroom = classrooms.get(classroomId.toUpperCase());
        
        if (!classroom) {
            return res.status(404).json({ error: '교실을 찾을 수 없습니다.' });
        }
        
        // YouTube URL 검증
        const youtubeRegex = /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        if (!youtubeRegex.test(url)) {
            return res.status(400).json({ error: '유효한 YouTube URL이 아닙니다.' });
        }
        
        const material = {
            id: uuidv4(),
            type: 'youtube',
            url: url,
            title: title || 'YouTube 동영상',
            uploadedAt: new Date(),
            order: classroom.materials.length
        };
        
        classroom.materials.push(material);
        
        // 모든 사용자에게 새 자료 알림
        io.to(classroomId.toUpperCase()).emit('materialAdded', material);
        
        res.json({
            success: true,
            material: material
        });
    } catch (error) {
        console.error('YouTube 링크 추가 오류:', error);
        res.status(500).json({ error: 'YouTube 링크 추가 중 오류가 발생했습니다.' });
    }
});

// 자료 순서 변경 엔드포인트
app.put('/api/materials/:classroomId/reorder', (req, res) => {
    try {
        const { classroomId } = req.params;
        const { materialIds } = req.body;
        const classroom = classrooms.get(classroomId.toUpperCase());
        
        if (!classroom) {
            return res.status(404).json({ error: '교실을 찾을 수 없습니다.' });
        }
        
        // 자료 순서 재정렬
        const reorderedMaterials = [];
        materialIds.forEach((id, index) => {
            const material = classroom.materials.find(m => m.id === id);
            if (material) {
                material.order = index;
                reorderedMaterials.push(material);
            }
        });
        
        classroom.materials = reorderedMaterials;
        
        // 모든 사용자에게 순서 변경 알림
        io.to(classroomId.toUpperCase()).emit('materialsReordered', reorderedMaterials);
        
        res.json({
            success: true,
            materials: reorderedMaterials
        });
    } catch (error) {
        console.error('자료 순서 변경 오류:', error);
        res.status(500).json({ error: '자료 순서 변경 중 오류가 발생했습니다.' });
    }
});

// 자료 삭제 엔드포인트
app.delete('/api/materials/:classroomId/:materialId', (req, res) => {
    try {
        const { classroomId, materialId } = req.params;
        const classroom = classrooms.get(classroomId.toUpperCase());
        
        if (!classroom) {
            return res.status(404).json({ error: '교실을 찾을 수 없습니다.' });
        }
        
        const materialIndex = classroom.materials.findIndex(m => m.id === materialId);
        if (materialIndex === -1) {
            return res.status(404).json({ error: '자료를 찾을 수 없습니다.' });
        }
        
        const material = classroom.materials[materialIndex];
        
        // 파일인 경우 실제 파일 삭제
        if (material.path && fs.existsSync(material.path)) {
            fs.unlinkSync(material.path);
        }
        
        classroom.materials.splice(materialIndex, 1);
        
        // 모든 사용자에게 자료 삭제 알림
        io.to(classroomId.toUpperCase()).emit('materialDeleted', materialId);
        
        res.json({
            success: true,
            message: '자료가 삭제되었습니다.'
        });
    } catch (error) {
        console.error('자료 삭제 오류:', error);
        res.status(500).json({ error: '자료 삭제 중 오류가 발생했습니다.' });
    }
});

// Socket.IO 연결 처리
io.on('connection', (socket) => {
    console.log('새로운 사용자가 연결되었습니다:', socket.id);
    
    // 교실 생성
    socket.on('createClassroom', (data) => {
        const { classroomName, teacherName } = data;
        const classroomId = uuidv4().substring(0, 8).toUpperCase();
        
        const classroom = {
            id: classroomId,
            name: classroomName,
            teacher: teacherName,
            isOpen: false,
            createdAt: new Date(),
            students: [],
            messages: [],
            materials: [],
            currentMaterial: null // 현재 표시 중인 자료
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
        
        socket.emit('classroomCreated', {
            success: true,
            classroom: classroom,
            user: teacher,
            messages: classroom.messages,
            materials: classroom.materials
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
        
        const user = {
            id: socket.id,
            name: name,
            role: role,
            classroomId: upperClassroomId
        };
        
        users.set(socket.id, user);
        socket.join(upperClassroomId);
        
        if (role === 'student') {
            classroom.students.push(user);
        }
        
        socket.emit('joinResult', {
            success: true,
            classroom: classroom,
            user: user,
            messages: classroom.messages,
            materials: classroom.materials,
            currentMaterial: classroom.currentMaterial
        });
        
        // 다른 사용자들에게 입장 알림
        socket.to(upperClassroomId).emit('userJoined', {
            name: user.name,
            role: user.role
        });
        
        console.log(`${name}이 교실 ${classroom.name}에 ${role}로 입장했습니다.`);
    });
    
    // 교실 열기/닫기 (기존 toggleClassroom 다음에 추가)
    socket.on('toggleClassroom', () => {
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
    
    // 교실 열기
    socket.on('openClassroom', (classroomCode) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 교실을 열 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId || classroomCode);
        if (!classroom) {
            socket.emit('error', { message: '교실을 찾을 수 없습니다.' });
            return;
        }
        
        classroom.isOpen = true;
        
        // 모든 사용자에게 교실 열림 알림
        io.to(user.classroomId || classroomCode).emit('classroomOpened');
        
        console.log(`교실 ${classroom.name}이 열렸습니다.`);
    });
    
    // 교실 닫기
    socket.on('closeClassroom', (classroomCode) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 교실을 닫을 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId || classroomCode);
        if (!classroom) {
            socket.emit('error', { message: '교실을 찾을 수 없습니다.' });
            return;
        }
        
        classroom.isOpen = false;
        
        // 모든 사용자에게 교실 닫힘 알림
        io.to(user.classroomId || classroomCode).emit('classroomClosed');
        
        console.log(`교실 ${classroom.name}이 닫혔습니다.`);
    });
    
    // 자료 표시 변경
    socket.on('changeMaterial', (data) => {
        const user = users.get(socket.id);
        
        if (!user || user.role !== 'teacher') {
            socket.emit('error', { message: '선생님만 자료를 변경할 수 있습니다.' });
            return;
        }
        
        const classroom = classrooms.get(user.classroomId);
        if (!classroom) {
            socket.emit('error', { message: '교실을 찾을 수 없습니다.' });
            return;
        }
        
        const { materialId } = data;
        const material = classroom.materials.find(m => m.id === materialId);
        
        if (!material) {
            socket.emit('error', { message: '자료를 찾을 수 없습니다.' });
            return;
        }
        
        classroom.currentMaterial = material;
        
        // 모든 사용자에게 자료 변경 알림
        io.to(user.classroomId).emit('materialChanged', material);
        
        console.log(`자료가 변경되었습니다: ${material.originalName || material.title}`);
    });
    
    // 메시지 전송 (기존 기능 유지)
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
    
    // 메시지 위치 업데이트 (기존 기능 유지)
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
    
    // 메시지 가시성 토글 (기존 기능 유지)
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
    
    // 메시지 삭제 (기존 기능 유지)
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
    
    // 선생님 재연결 처리 (이 위치로 이동)
    socket.on('reconnectTeacher', (classroomCode) => {
        if (classrooms.get(classroomCode)) {
            socket.join(classroomCode);
            const classroom = classrooms.get(classroomCode);
            classroom.teacherSocket = socket.id;
            
            // 현재 학생 수 전송
            const studentCount = classroom.students.length;
            socket.emit('studentCountUpdate', studentCount);
            
            console.log(`선생님이 교실 ${classroomCode}에 재연결되었습니다.`);
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
    console.log(`🚀 업그레이드 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`📚 선생님용 V2: http://localhost:${PORT}/teacher`);
    console.log(`👨‍🎓 학생용 V2: http://localhost:${PORT}/student`);
});

// 선생님 재연결 처리
// 이 부분을 모두 삭제하세요 (627-634번째 줄)
// 선생님 재연결 처리
// 이 전체 블록을 삭제하세요 (627-632번째 줄)
// 선생님 재연결 처리
socket.on('reconnectTeacher', (classroomCode) => {
    if (classrooms[classroomCode]) {
        socket.join(classroomCode);
        classrooms[classroomCode].teacherSocket = socket.id;
        
        // 현재 학생 수 전송
        const studentCount = classrooms[classroomCode].students.length;
        socket.emit('studentCountUpdate', studentCount);
        
        console.log(`선생님이 교실 ${classroomCode}에 재연결되었습니다.`);
    }
});