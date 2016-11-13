var express = require('express');
var router = express.Router();
var downloader = require("../src/downloader");
var Q = require("q");

router.get('/', function (req, res) {
    res.render('index',
        {
            title: "SeriesAutoDownloader",
            episodes: downloader.getEpisodes(),
            providedEpisodes: downloader.getProvidedEpisodes(),
            series: downloader.getSeries()
        });
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

router.delete('/series/:id', function (req, res) {
    downloader.deleteSeries(req.params.id);
    res.sendStatus(200);
});

router.delete('/provided-episode/:id', function (req, res) {
    downloader.deleteProvidedEpisode(req.params.id);
    res.sendStatus(200);
});

module.exports = router;
