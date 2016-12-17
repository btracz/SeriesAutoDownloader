var express = require('express');
var router = express.Router();
var downloader = require("../src/downloader");
var scheduler = require("../src/scheduler");
var Q = require("q");
var fs = require("fs");
var path = require("path");
var config = JSON.parse(fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf8'));

/*Authentification*/
var basicAuth = require('basic-auth');
var auth = function (req, res, next) {
    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.sendStatus(401);
    }

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
        return unauthorized(res);
    }
    if (config.login && config.password) {
        if (user.name === config.login && user.pass === config.password) {
            return next();
        }
    } else if (user.name === 'admin' && user.pass === 's3ri3s') {
        return next();
    }

    return unauthorized(res);
};

router.get('/', auth, function (req, res) {
    res.render('index',
        {
            title: "SeriesAutoDownloader",
            episodes: downloader.getEpisodes(),
            providedEpisodes: downloader.getProvidedEpisodes(),
            series: downloader.getSeries()
        });
});

router.get('/status', auth, function (req, res) {
    res.render('status',
        {
            title: "SeriesAutoDownloader",
            episodes: downloader.getEpisodes(),
            providedEpisodes: downloader.getProvidedEpisodes(),
            series: downloader.getSeries(),
            jobs: scheduler.getTasks()
        });
});

router.get('/episodes/search', auth, function (req, res) {
    downloader.searchForEpisodesToDownload().then((episodes)=> {
            res.send(JSON.stringify(episodes, null, 4));
        }
    );
});

router.get('/torrents/search', auth, function (req, res) {
    downloader.searchEpisodeTorrents().then((episodes)=> {
            res.send(JSON.stringify(episodes, null, 4));
        }
    );
});

router.get('/torrents/download', auth, function (req, res) {
    downloader.downloadEpisodeTorrents().then((episodes)=> {
            res.send(JSON.stringify(episodes, null, 4));
        }
    );
});

router.get('/torrents/watch', auth, function (req, res) {
    downloader.watchTorrents();
    res.send(JSON.stringify(downloader.getEpisodes(), null, 4));
});

router.get('/subs/search', auth, function (req, res) {
    downloader.findEpisodeSubtitles();
    res.send(JSON.stringify(downloader.getEpisodes(), null, 4));
});

router.get('/torrents', auth, function (req, res) {
    downloader.getTorrentsStatus().then((status)=> {
            res.send(JSON.stringify(status, null, 4));
        }
    );
});

router.get('/torrent/:id', auth, function (req, res) {
    downloader.getTorrentStatus(req.params.id).then((status)=> {
            res.send(JSON.stringify(status, null, 4));
        }
    );
});

module.exports = router;
