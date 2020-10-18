var express = require('express');
var router = express.Router();
var downloader = require("../src/downloader");
const auth = require("../middlewares/auth");


router.delete('/series/:id', auth, function (req, res) {
    downloader.deleteSeries(req.params.id);
    res.sendStatus(200);
});

router.delete('/provided-episode/:id', auth, function (req, res) {
    downloader.deleteProvidedEpisode(req.params.id);
    res.sendStatus(200);
});

router.delete('/episode/:id', auth, function (req, res) {
    downloader.deleteEpisode(req.params.id);
    res.sendStatus(200);
});

router.get('/series', auth, function (req, res) {
    downloader.searchSeries(req.query.name).then(series => {
        console.log(`Series search '${req.query.name}' results :`, series.slice(0, 5));
        res.send(JSON.stringify(series));
    });
});

router.post('/series', auth, function (req, res) {
    try {
        downloader.addSeries(req.body);
        res.status(200).send({status: 'OK'});
    } catch (err) {
        res.status(409).send(err.message);
    }
});

module.exports = router;
