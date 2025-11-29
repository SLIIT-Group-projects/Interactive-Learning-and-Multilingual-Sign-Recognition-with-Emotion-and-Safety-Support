exports.dummyTranslate = (req, res) => {
    return res.json({
        label: "HELLO",
        confidence: 0.95
    });
};
