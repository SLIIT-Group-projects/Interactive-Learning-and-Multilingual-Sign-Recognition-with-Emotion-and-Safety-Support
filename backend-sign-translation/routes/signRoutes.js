const express = require("express");
const router = express.Router();
const { dummyTranslate } = require("../controllers/signController");

router.post("/infer", dummyTranslate);

module.exports = router;
