var express = require('express');
var router = express.Router();
var downloader = require("../src/downloader");
var Q = require("q");

router.get('/', function (req, res) {
    res.send(JSON.stringify(downloader.getEpisodes(), null, 4));
});

router.get('/search', function (req, res) {
    downloader.searchForEpisodesToDownload().then((episodes)=> {
            res.send(JSON.stringify(episodes, null, 4));
        }
    );
});

router.get('/torrents', function (req, res) {
    downloader.getTorrentsStatus().then((status)=> {
            res.send(JSON.stringify(status, null, 4));
        }
    );
});

router.get('/torrent/:id', function (req, res) {
    downloader.getTorrentStatus(req.params.id).then((status)=> {
            res.send(JSON.stringify(status, null, 4));
        }
    );
});

module.exports = router;
