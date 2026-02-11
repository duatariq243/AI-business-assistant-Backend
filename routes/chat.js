const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const chatController = require("../controllers/chatController"); 
const {createChat,sendMessage ,getChatMessages ,getUserChats ,deleteChat,renameChat,getChatAnalytics} = require ("../controllers/chatController");




//get chat messages bu ChatId
router.get("/", authMiddleware, getUserChats);
router.get("/:chatId", authMiddleware, getChatMessages);
router.post("/", authMiddleware, createChat);
router.delete("/:chatId", authMiddleware, deleteChat);
router.post("/message", authMiddleware, sendMessage);
router.get("/analytics/:chatId", authMiddleware, getChatAnalytics);
router.patch("/:chatId/rename", authMiddleware, renameChat);



module.exports = router;