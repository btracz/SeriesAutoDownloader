var express = require('express');
var router = express.Router();
var downloader = require("../src/downloader");
var Q = require("q");
var fs = require("fs");
var path = require("path");
var config = JSON.parse(fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf8'));

/*Authentification*/
var basicAuth = require('basic-auth');
var auth = function (req, res, next) {
    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.send(401);
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

router.delete('/series/:id', auth, function (req, res) {
    downloader.deleteSeries(req.params.id);
    res.sendStatus(200);
});

router.delete('/provided-episode/:id', auth, function (req, res) {
    downloader.deleteProvidedEpisode(req.params.id);
    res.sendStatus(200);
});

router.get('/series', auth, function (req, res) {
    downloader.searchSeries(req.query.name).then(series => {
        res.send(JSON.stringify(series));
    });
});

module.exports = router;
