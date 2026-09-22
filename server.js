const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ===== 📊 تخزين الغرف والبث =====
const rooms = {};

// ===== 📝 سجل الأحداث =====
console.log('🚀 بدء تشغيل خادم البث المباشر...');

// ===== 🔗 اتصال Socket.IO =====
io.on('connection', (socket) => {
    console.log(`🟢 مستخدم متصل: ${socket.id}`);

    // ===== 📺 بدء البث =====
    socket.on('start_broadcast', (streamId) => {
        console.log(`📺 بدء البث: ${streamId} من ${socket.id}`);
        
        // إنشاء غرفة جديدة إذا لم تكن موجودة
        if (!rooms[streamId]) {
            rooms[streamId] = {
                broadcaster: socket.id,
                viewers: [],
                active: true,
                startTime: Date.now()
            };
        } else {
            rooms[streamId].broadcaster = socket.id;
            rooms[streamId].active = true;
        }
        
        socket.join(streamId);
        socket.streamId = streamId;
        socket.role = 'broadcaster';
        
        // إعلام الجميع ببدء البث
        io.to(streamId).emit('broadcast_started', {
            streamId: streamId,
            broadcasterId: socket.id
        });
        
        console.log(`✅ البث نشط في الغرفة: ${streamId}`);
    });

    // ===== 👁️ مشاهدة البث =====
    socket.on('watch_stream', (data) => {
        const { streamId, viewerId } = data;
        
        console.log(`👁️ مشاهد ${viewerId || socket.id} يريد مشاهدة ${streamId}`);
        
        if (rooms[streamId] && rooms[streamId].active) {
            socket.join(streamId);
            socket.streamId = streamId;
            socket.role = 'viewer';
            
            // إضافة المشاهد إلى القائمة
            if (!rooms[streamId].viewers.includes(socket.id)) {
                rooms[streamId].viewers.push(socket.id);
            }
            
            // إعلام المشاهد بأن البث جاهز
            socket.emit('stream_ready', {
                streamId: streamId,
                broadcasterId: rooms[streamId].broadcaster,
                viewers: rooms[streamId].viewers.length
            });
            
            // إعلام البث بوجود مشاهد جديد
            io.to(rooms[streamId].broadcaster).emit('viewer_joined', {
                viewerId: socket.id,
                count: rooms[streamId].viewers.length
            });
            
            console.log(`✅ مشاهد ${socket.id} انضم إلى ${streamId}`);
        } else {
            socket.emit('stream_not_found', {
                message: 'البث غير موجود أو غير نشط'
            });
            console.log(`❌ البث غير موجود: ${streamId}`);
        }
    });

    // ===== 📨 إشارات WebRTC =====
    socket.on('offer', (data) => {
        const { streamId, sdp, targetId } = data;
        console.log(`📨 Offer من ${socket.id} إلى ${targetId || 'الجميع'}`);
        
        if (targetId) {
            io.to(targetId).emit('offer', {
                sdp: sdp,
                fromId: socket.id
            });
        } else {
            socket.to(streamId).emit('offer', {
                sdp: sdp,
                fromId: socket.id
            });
        }
    });

    socket.on('answer', (data) => {
        const { streamId, sdp, targetId } = data;
        console.log(`📨 Answer من ${socket.id} إلى ${targetId}`);
        
        io.to(targetId).emit('answer', {
            sdp: sdp,
            fromId: socket.id
        });
    });

    socket.on('candidate', (data) => {
        const { streamId, candidate, targetId } = data;
        console.log(`📨 Candidate من ${socket.id}`);
        
        if (targetId) {
            io.to(targetId).emit('candidate', {
                candidate: candidate,
                fromId: socket.id
            });
        } else {
            socket.to(streamId).emit('candidate', {
                candidate: candidate,
                fromId: socket.id
            });
        }
    });

    // ===== ⏹️ إيقاف البث =====
    socket.on('stop_broadcast', (data) => {
        const { streamId } = data;
        console.log(`⏹️ طلب إيقاف البث: ${streamId} من ${socket.id}`);
        
        if (rooms[streamId]) {
            rooms[streamId].active = false;
            io.to(streamId).emit('stream_ended', {
                streamId: streamId
            });
            
            // تنظيف الغرفة بعد 5 دقائق
            setTimeout(() => {
                if (rooms[streamId] && !rooms[streamId].active) {
                    delete rooms[streamId];
                    console.log(`🧹 تم تنظيف الغرفة: ${streamId}`);
                }
            }, 300000);
        }
    });

    // ===== ❌ مغادرة الغرفة =====
    socket.on('leave_room', (data) => {
        const { streamId } = data;
        console.log(`👋 مغادرة الغرفة: ${streamId} من ${socket.id}`);
        
        if (streamId && rooms[streamId]) {
            // إزالة المشاهد من القائمة
            rooms[streamId].viewers = rooms[streamId].viewers.filter(id => id !== socket.id);
            
            // إعلام البث بأن مشاهداً غادر
            io.to(rooms[streamId].broadcaster).emit('viewer_left', {
                viewerId: socket.id,
                count: rooms[streamId].viewers.length
            });
        }
        
        socket.leave(streamId);
        socket.streamId = null;
        socket.role = null;
    });

    // ===== 🔌 قطع الاتصال =====
    socket.on('disconnect', () => {
        console.log(`🔴 غير متصل: ${socket.id}`);
        
        // إذا كان المستخدم بثاً مباشراً
        if (socket.streamId && rooms[socket.streamId]) {
            if (rooms[socket.streamId].broadcaster === socket.id) {
                rooms[socket.streamId].active = false;
                io.to(socket.streamId).emit('stream_ended', {
                    streamId: socket.streamId
                });
                console.log(`⏹️ توقف البث (انقطع البث): ${socket.streamId}`);
            } else {
                // إزالة المشاهد
                rooms[socket.streamId].viewers = rooms[socket.streamId].viewers.filter(id => id !== socket.id);
                io.to(rooms[socket.streamId].broadcaster).emit('viewer_left', {
                    viewerId: socket.id,
                    count: rooms[socket.streamId].viewers.length
                });
            }
        }
    });

    // ===== 💬 حدث عام لتمرير أي رسالة بين أي طرفين =====
    socket.on("relay_message", (data) => {
        const { targetId, type, payload } = data;
        if (!targetId) {
            console.log(`⚠️ relay_message بدون targetId من ${socket.id}`);
            return;
        }
        console.log(`💬 relay ${type} من ${socket.id} إلى ${targetId}`);
        io.to(targetId).emit("relay_message", {
            fromId: socket.id,
            type: type,
            payload: payload,
            timestamp: Date.now()
        });
    });

});

// ===== 📊 صفحة حالة الخادم =====
app.get('/status', (req, res) => {
    const activeRooms = Object.keys(rooms).filter(key => rooms[key].active);
    res.json({
        status: 'online',
        activeRooms: activeRooms,
        rooms: rooms,
        totalConnections: io.engine.clientsCount
    });
});

// ===== 🏠 الصفحة الرئيسية =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// ===== 🚀 تشغيل الخادم =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 خادم البث يعمل على http://0.0.0.0:${PORT}`);
    console.log(`📺 صفحة المشاهدة: http://0.0.0.0:${PORT}`);
    console.log(`📊 حالة الخادم: http://0.0.0.0:${PORT}/status`);
    console.log(`👥 جاهز لاستقبال الاتصالات...`);
});
