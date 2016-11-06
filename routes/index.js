var express = require('express');
var router = express.Router();
var downloader = require("../src/downloader");
var Q = require("q");

/* GET home page. */
router.get('/', function (req, res) {
    downloader.searchForEpisodesToDownload().then(airedEpisodes => {
        console.log("searchForEpisodesToDownload terminé");
        if (airedEpisodes && airedEpisodes.length > 0) {
            downloader.searchEpisodeTorrents(airedEpisodes).then(downloadableEpisodes => {
                console.log("searchEpisodeTorrents terminé");
                if (downloadableEpisodes && downloadableEpisodes.length > 0) {
                    downloader.downloadEpisodeTorrents(downloadableEpisodes).then(downloadingEpisodes => {
                        console.log("downloadEpisodeTorrents terminé");
                        res.render('index', {
                            title: `${airedEpisodes.length} épisode(s)`,
                            episodes: downloadingEpisodes
                        });
                    });
                }
            });
        } else {
            res.render('index', {title: 'Aucun épisode'});
        }
    });
});

module.exports = router;
