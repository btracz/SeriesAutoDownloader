var Client = require("node-tvdb");
var fs = require("fs");
var path = require("path");
var moment = require("moment");
const superagent = require("superagent");
var Q = require("q");
var request = require("request");
var Transmission = require('transmission');
var scheduler = require("./scheduler");
var config = require('../config');
var series = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/series.json'), 'utf8'));
var episodes = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/airedEpisodesToProvide.json'), 'utf8'));
var providedEpisodes = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/providedEpisodes.json'), 'utf8'));
var transmission = new Transmission(config.transmission);
const OpenSub = require('opensubtitles-api');
const OpenSubtitles = new OpenSub({
    useragent: config.openSubtitles.UA,
    username: config.openSubtitles.username,
    password: require('crypto').createHash('md5').update(config.openSubtitles.password).digest('hex'),
    ssl: true
});


module.exports = {
    startEpisodeFinder: startEpisodeFinder,
    startTorrentWatcher: startTorrentWatcher,
    startSubFinder: startSubFinder,
    searchForEpisodesToDownload: searchForEpisodesToDownload,
    searchEpisodeTorrents: searchEpisodeTorrents,
    downloadEpisodeTorrents: downloadEpisodeTorrents,
    watchTorrents: watchTorrents,
    findEpisodeSubtitles: findEpisodeSubtitles,
    getTorrentsStatus: getTorrentsStatus,
    getTorrentStatus: getTorrentStatus,
    getEpisodes: getEpisodes,
    getProvidedEpisodes: getProvidedEpisodes,
    getSeries: getSeries,
    deleteSeries: deleteSeries,
    addSeries: addSeries,
    searchSeries: searchSeries,
    deleteEpisode: deleteEpisode,
    deleteProvidedEpisode: deleteProvidedEpisode
};

function getEpisodes() {
    return episodes;
}

function getProvidedEpisodes() {
    return providedEpisodes;
}

function deleteProvidedEpisode(index) {
    providedEpisodes.splice(index, 1);
    saveEpisodes();
}

function deleteEpisode(index) {
    episodes.splice(index, 1);
    saveEpisodes();
}

function getSeries() {
    return series;
}

function addSeries(newSeries) {
    if (series.find(s => s.id === newSeries.id)) {
        throw new Error("Série déjà surveillée");
    }
    series.push(newSeries);
    saveSeries();
}

function deleteSeries(index) {
    series.splice(index, 1);
    saveSeries();
}

function searchSeries(partialName) {
    let defer = Q.defer();
    let tvdb = new Client(config.tvDb.apiKey);
    tvdb.getSeriesByName(partialName)
        .then(function (response) {
            defer.resolve(response);
        })
        .catch(function (error) {
            defer.reject(error);
        });

    return defer.promise;
}

scheduler.createJob("episodeFinder", "0 16 * * *", searchForEpisodesToDownload);
scheduler.createJob("torrentFinder", "2-52/10 * * * *", searchEpisodeTorrents);
scheduler.createJob("torrentDownloader", "5-55/10 * * * *", downloadEpisodeTorrents);
scheduler.createJob("torrentWatcher", "7-57/10 * * * *", watchTorrents);
scheduler.createJob("subFinder", "9-59/10 * * * *", findEpisodeSubtitles);

/* ##### TACHES #### */
function startEpisodeFinder() {
    console.log("lancement de l'ordonnanceur de recherche d'épisodes quotidien");
    scheduler.startTask("episodeFinder");
}

function stopEpisodeFinder() {
    console.log("arrêt de l'ordonnanceur de recherche d'épisodes quotidien");
    scheduler.stopTask("episodeFinder");
}

function startTorrentFinder() {
    console.log("lancement de l'ordonnanceur de recherche de torrents");
    scheduler.startTask("torrentFinder");
}

function stopTorrentFinder() {
    console.log("arrêt de l'ordonnanceur de recherche de torrents");
    scheduler.stopTask("torrentFinder");
}

function startTorrentDownloader() {
    console.log("lancement de l'ordonnanceur d'ajout de torrent à transmission");
    scheduler.startTask("torrentDownloader");
}

function stopTorrentDownloader() {
    console.log("arrêt de l'ordonnanceur d'ajout de torrent à transmission");
    scheduler.stopTask("torrentDownloader");
}

function startTorrentWatcher() {
    console.log("lancement de la surveillance et classification des torrents");
    scheduler.startTask("torrentWatcher");
}

function stopTorrentWatcher() {
    console.log("arrêt de la surveillance et classification des torrents");
    scheduler.stopTask("torrentWatcher");
}

function startSubFinder() {
    console.log("lancement de la recherche des sous-titres");
    scheduler.startTask("subFinder");
}

function stopSubFinder() {
    console.log("arrêt de la recherche des sous-titres");
    scheduler.stopTask("subFinder");
}

/* #### FIN DES TACHES #### */

function findAndDownloadNewEpisodes() {
    let defer = Q.defer();
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Recherche d'épisodes`);
    searchForEpisodesToDownload().then(airedEpisodes => {
        console.log("SearchForEpisodesToDownload terminé");
        if (airedEpisodes && airedEpisodes.length > 0) {
            console.log(`${airedEpisodes.length} épisode(s) trouvé(s)`);
            searchEpisodeTorrents(airedEpisodes).then(downloadableEpisodes => {
                console.log("searchEpisodeTorrents terminé");
                if (downloadableEpisodes && downloadableEpisodes.length > 0) {
                    console.log(`${downloadableEpisodes.length} épisode(s) téléchargeable(s)`);
                    downloadEpisodeTorrents(downloadableEpisodes).then(downloadingEpisodes => {
                        console.log("downloadEpisodeTorrents terminé");
                        if (downloadingEpisodes && downloadingEpisodes.length > 0) {
                            console.log(`${downloadingEpisodes.length} épisode(s) en cours de téléchargement`);

                            downloadingEpisodes.forEach((downloadingEpisode) => {
                                episodes.push(downloadingEpisode);
                            });

                            defer.resolve(episodes);
                            saveEpisodes();
                        } else {
                            defer.resolve("Pas de torrent en cours");
                            console.log(`Pas de torrent en cours`);
                        }
                    });
                } else {
                    defer.resolve("Pas de torrent trouvé");
                    console.log(`Pas de torrent trouvé`);
                }
            });
        } else {
            defer.resolve("Aucun épisode trouvé");
            console.log(`Aucun épisode trouvé`);
        }
    });

    return defer.promise;
}

function searchForEpisodesToDownload() {
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Recherche des épisodes`);
    let defer = Q.defer();
    let tvdb = new Client(config.tvDb.apiKey);

    var promises = [];

    if (!series) {
        series = [];
    }

    series.forEach(serie => {
        moment().diff
		var today = moment();
		var march = moment([2020, 2, 1]);
		let nbDays = today.diff(march, 'days');
		// On cherche les épisodes diffusés depuis mars
		for(let i=nbDays; i<=1;i--) {
			promises.push(
				tvdb.getEpisodeByAirDate(serie.id, moment().add(-i, "days").format("YYYY-MM-DD"))
					.then(results => {
						return {
							...serie,
							results
						}
					})
			);
		}
    });
    Q.allSettled(promises).then(series => {
		//console.log("[searchForEpisodesToDownload] series :", series);
        let episodesToDL = [];
        series.forEach(function (serie) {
            
            if (serie.state === "fulfilled") {
                if (serie.value && serie.value.results) {
                    console.log(`TV Db response : ${JSON.stringify(serie.value.results)}`);
                    if (Array.isArray(serie.value.results)) {
                        serie.value.results.forEach(tvDbEpisode => {
                            var convertedEpisode = logAndConvertEpisodeForDL(tvDbEpisode, serie.value.options);
                            if (checkIfEpisodeIsKnown(convertedEpisode)) {
                                episodes.push(convertedEpisode);
                                episodesToDL.push(convertedEpisode);
                            } else {
                                console.log(`Episode déjà  connu : ${convertedEpisode.series} S${convertedEpisode.season}E${convertedEpisode.number}`);
                            }
                        });
                    } else {
                        var convertedEpisode = logAndConvertEpisodeForDL(serie.value.results, serie.value.options);
                        if (checkIfEpisodeIsKnown(convertedEpisode)) {
                            episodes.push(convertedEpisode);
                            episodesToDL.push(convertedEpisode);
                        } else {
                            console.log(`Episode déjà connu : ${convertedEpisode.series} S${convertedEpisode.season}E${convertedEpisode.number}`);
                        }
                    }
                }
            } else {
                console.log(`Erreur de promesse ${result.reason}`);
            }
        });

        saveEpisodes();

        if (episodes.length > 0) {
            startTorrentFinder();
        }

        defer.resolve(episodesToDL);
    });

    return defer.promise;
}

function searchEpisodeTorrents() {
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Recherche des torrents`);
    let defer = Q.defer();
    var promises = [];
    episodes.forEach(episode => {
        const episodeString = `S${episode.season}E${episode.number}`;
        const searchText = `${episode.series} ${episodeString}${episode.options ? ' ' + episode.options : ''}`;
        console.log("searchText", searchText);
        // On cherche les torrents des épisodes
        promises.push(
            superagent.get(config.jackett.endpoint)
                      .query({ apikey: config.jackett.apiKey, Query: searchText })
                      .then(result => {
                        // trie par seeders desc
                        let matchingTorrents = result.body.Results.filter(r => r.Title.includes(episodeString));
                        matchingTorrents.sort((a, b) => a.Seeders - b.Seeders);
                        return matchingTorrents;
                      })
        );
    });

    Q.allSettled(promises).then(results => {
        results.forEach(function (result, index) {
            if (result.state === "fulfilled") {
                if (result.value && result.value.length > 0) {
                    console.log(`Torrents trouvés : ${JSON.stringify(result.value.length)}`);
                    if (!episodes[index].torrentName && !episodes[index].magnetLink) {
                        episodes[index].torrentName = result.value[0].Title;
                        episodes[index].magnetLink = result.value[0].MagnetUri;
                    }
                } else {
                    console.log(`Pas de torrent trouvé`, result);
                }
            } else {
                console.log(`Erreur de promesse ${result.reason}`);
            }
        });

        saveEpisodes();

        if (episodes.filter(function (episode) {
                return !episode.magnetLink;
            }).length === 0) {
            stopTorrentFinder();
        }

        if (episodes.filter(function (episode) {
                return !episode.transmissionId;
            }).length > 0) {
            startTorrentDownloader();
        }

        defer.resolve(episodes);
    });

    return defer.promise;
}

function downloadEpisodeTorrents() {
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Ajout des torrents`);

    let requests = episodes.map((episode) => {
        if (!episode.episode) {
            return new Promise((resolve) => {
                transmission.addUrl(episode.magnetLink, {
                    "download-dir": config.downloadDir
                }, (error, result) => {
                    if (error) {
                        console.log(`Erreur à l'ajout d'un torrent : ${error}`)
                    } else {
                        console.log(`Torrent ajouté : ${result.id}`);
                        episode.transmissionId = result.id;
                        transmission.start(result.id, function (err) {
                            if (err) {
                                console.log(`Erreur au démarrage d'un torrent : ${error}`)
                            } else {
                                console.log(`Torrent démarré : ${result.id}`);
                            }
                        });
                    }
                    resolve();
                });
            });
        } else {
            return new Promise((resolve) => {
                resolve();
            });
        }
    });

    return Promise.all(requests).then(() => {

        if (episodes.filter(function (episode) {
                return !episode.transmissionId;
            }).length === 0) {
            stopTorrentDownloader();
        }

        if (episodes.filter(function (episode) {
                return !episode.videoPath;
            }).length > 0) {
            startTorrentWatcher();
        }

        saveEpisodes();
        return episodes;
    });
}

function watchTorrents() {
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Vérification des torrents`);
    if (episodes && episodes.length > 0) {
        getTorrentsStatus().then((torrentsStatus) => {
            console.log(`Torrents status : ${JSON.stringify(torrentsStatus)}`);
            var activeTorrents = [];
            if (torrentsStatus && torrentsStatus.torrents && torrentsStatus.torrents.length > 0) {
                torrentsStatus.torrents.forEach((torrent) => {
                    console.log(`Torrent (${torrent.id}) ${torrent.name}, status : ${torrent.status}, doneDate ${torrent.doneDate}`);
                    if (torrent.doneDate > 0) {
                        var epiIndex = getEpisodeIndexFromTorrentNameOrId(torrent.name, torrent.id);
                        console.log(`Episode index ${epiIndex}`);
                        // Le torrent est rattaché à un episode à mettre à disposition
                        if (epiIndex > -1) {
                            // L'emplacement du fichier n'est pas encore connu
                            if (!episodes[epiIndex].videoFile) {
                                console.log(`Fichiers : ${JSON.stringify(torrent.files)}`);
                                // On arrête le torrent avant de déplacer le fichier
                                if (torrent.status !== 0) {
                                    var videoFile = getVideoFilePath(torrent);
                                    if (videoFile) {
                                        var videoFileName = videoFile.split('/').pop();
                                        // Gérer le cas sans répertoire
                                        console.log(`Fichier vidéo : ${videoFileName}`);

                                        var videoFullPath = `${config.downloadDir}/${videoFile}`;

                                        console.log(`Emplacement vidéo : ${videoFullPath}`);

                                        // On enregistre les infos
                                        episodes[epiIndex].videoPath = videoFullPath;
                                        episodes[epiIndex].videoFileName = videoFileName;
                                        saveEpisodes();

                                        if (episodes.filter(function (episode) {
                                                return !episode.videoPath;
                                            }).length === 0) {
                                            stopTorrentWatcher();
                                        }

                                        if (episodes.length > 0) {
                                            startSubFinder();
                                        }

                                        transmission.stop([torrent.id], function (err, arg) {
                                            console.log(`Torrent ${torrent.id} arrêté`);
                                            if (videoFile) {
                                                // On le déplace dans DLNA si on est le serveur transmission
                                                if (config.isTransmissionServer) {
                                                    // Classé par nom de série et saison
                                                    let dir = `${config.dlnaDir}/${episodes[epiIndex].series}/S${episodes[epiIndex].season}`;
                                                    if (!fs.existsSync(dir)){
                                                        fs.mkdirSync(dir, { recursive: true });
                                                    }

                                                    fs.rename(videoFullPath, `${dir}/${videoFileName}`, (err) => {
                                                        if (!err) {
                                                            console.log(`fichier ${videoFileName} déplacé dans dlna`);
                                                        } else {
                                                            console.error(`impossible de déplacer le fichier ${videoFileName}, raison : `, err)
                                                        }
                                                    });
                                                }

                                                // Supprimer le répertoire
                                            } else {
                                                console.log(`Pas de fichier vidéo trouvé dans le torrent, fichiers : ${JSON.stringify(torrent.files)}`);
                                            }
                                        });
                                    }
                                } else {
                                    console.log("Torrent déjà arrêté");
                                }
                            }
                        }
                    }
                });
            }
        });
    } else {
        stopTorrentWatcher();
    }
}

function findEpisodeSubtitles() {
    console.log(`${moment().format("DD/MM/YYYY HH:mm:ss")} : Recherche de sous-titres`);
    if (episodes && episodes.length > 0) {
        OpenSubtitles.login()
            .then(res => {
                console.log(`Token open-subtitles : ${res.token}`);
                var i = episodes.length;
                var promises = [];
                while (i--) {
                    if (episodes[i].videoFileName) {
                        promises.push(((index) => {
                            let defer = Q.defer();
                            OpenSubtitles.search({
                                sublanguageid: 'eng',
                                query: episodes[index].videoFileName,
                                limit: 'best'
                            }).then((subtitles) => {
                                console.log(`Promesse ${index}`);
                                if (subtitles && subtitles.en) {
                                    console.log(`(n°${index + 1}) Sous-titres trouvés pour ${episodes[index].series} S${episodes[index].season}E${episodes[index].number}: ${JSON.stringify(subtitles)}`);
                                    episodes[index].subs = subtitles.en.url;

                                    request(subtitles.en.url, function (error, response, fileContent) {
                                        if (!error && response.statusCode === 200) {
                                            var splittedVideoName = episodes[index].videoFileName.split('.');
                                            splittedVideoName[splittedVideoName.length - 1] = "srt";
                                            var subFile = splittedVideoName.join('.');
                                            if (config.isTransmissionServer) {
                                                // Classé par nom de série et saison
                                                let dir = `${config.dlnaDir}/${episodes[index].series}/S${episodes[index].season}`;
                                                if (!fs.existsSync(dir)){
                                                    fs.mkdirSync(dir, { recursive: true });
                                                }

                                                var file = fs.createWriteStream(`${dir}/${subFile}`);
                                                file.write(fileContent, () => {
                                                    file.close();
                                                });
                                            } else {
                                                console.log(`${subFile} : longueur ${fileContent.length}`);
                                            }
                                            defer.resolve(index);
                                        } else {
                                            console.log(error);
                                            defer.reject();
                                        }
                                    });
                                } else {
                                    console.log(`(n°${index + 1}) Pas de sous-titres trouvés pour ${episodes[index].series} S${episodes[index].season}E${episodes[index].number}`);
                                    defer.reject();
                                }
                            }).catch(err => {
                                console.error(episodes[i].videoFileName, err);
                            });

                            return defer.promise;
                        })(i));
                    }
                }
                console.log(`Nombre de promesses sous-titres ${promises.length}`);

                Q.allSettled(promises).then(results => {
                    console.log(`Promesses sous-titres terminées`);
                    var toDestroyIndexes = [];
                    results.forEach((result, index) => {
                        console.log(`Promesse n°${index}, résultat ${result.state}, valeur ${result.value}`);
                        if (result.state === "fulfilled") {
                            toDestroyIndexes.push(result.value);
                        }
                    });
                    console.log(`${toDestroyIndexes.length} épisodes à détruire`);
                    if (toDestroyIndexes.length > 0) {
                        toDestroyIndexes.sort((a, b) => {
                            return b - a;
                        });
                        toDestroyIndexes.forEach((index) => {
                            providedEpisodes.push(episodes[index]);
                            episodes.splice(index, 1);
                        });

                        saveEpisodes();

                        if (episodes.length === 0) {
                            stopSubFinder();
                        }
                    }
                });
            })
            .catch(err => {
                console.log(err);
            });
    }
}

/*
 STOPPED       : 0  # Torrent is stopped
 CHECK_WAIT    : 1  # Queued to check files
 CHECK         : 2  # Checking files
 DOWNLOAD_WAIT : 3  # Queued to download
 DOWNLOAD      : 4  # Downloading
 SEED_WAIT     : 5  # Queued to seed
 SEED          : 6  # Seeding
 ISOLATED      : 7  # Torrent can't find peers
 */
function getTorrentsStatus() {
    let defer = Q.defer();

    transmission.get(function (err, result) {
        if (err) {
            console.log(err);
        }
        else {
            defer.resolve(result);
        }
    });

    return defer.promise;
}

function getTorrentStatus(id) {
    let defer = Q.defer();

    transmission.get([parseInt(id)], function (err, result) {
        if (err) {
            console.log(err);
        }
        else {
            defer.resolve(result);
        }
    });

    return defer.promise;
}

function getSeriesName(id) {
    let matchingSeries = series.filter(serie => {
        return serie.id == id;
    });

    if (matchingSeries && matchingSeries.length > 0) {
        return matchingSeries[0].name;
    } else {
        return '';
    }
}

function getEpisodeIndexFromTorrentNameOrId(torrentName, torrentId) {
    var result = -1;

    if (episodes) {
        episodes.forEach((episode, index) => {
            if (episode.torrentName == torrentName || episode.transmissionId == torrentId) {
                result = index;
            }
        });
    }

    return result;
}

function getVideoFilePath(torrent) {
    var videoFiles = torrent.files.filter((file)=> {
        var splittedName = file.name.split('.');
        var isVideo = (splittedName[splittedName.length - 1].toLowerCase() == "mkv" ||
        splittedName[splittedName.length - 1].toLowerCase() == "mp4");
        console.log(`${file.name} ${isVideo}`);
        return isVideo;
    });

    console.log(`videoFiles ${JSON.stringify(videoFiles)}`);

    if (videoFiles && videoFiles.length == 1) {
        return videoFiles[0].name;
    } else if (videoFiles && videoFiles.length > 1) {
        return videoFiles.sort((a, b) => {
            return b["length"] - a["length"];
        })[0].name;
    }
}

function logAndConvertEpisodeForDL(tvDbEpisode, options) {
    let episode = {
        "series": getSeriesName(tvDbEpisode.seriesid),
        "options": options,
        "name": tvDbEpisode.EpisodeName,
        "season": tvDbEpisode.SeasonNumber.length === 1 ? `0${tvDbEpisode.SeasonNumber}` : tvDbEpisode.SeasonNumber,
        "number": tvDbEpisode.EpisodeNumber.length === 1 ? `0${tvDbEpisode.EpisodeNumber}` : tvDbEpisode.EpisodeNumber
    };
    console.log(`${episode.series}, épisode diffusé hier : ${episode.name} (S${episode.season}E${episode.number}) [${options}]`);

    return episode;
}

function checkIfEpisodeIsKnown({series, season, number}) {
    return (episodes.findIndex(e => e.series === series
    && e.number === number
    && e.season === season)
    < 0) && (providedEpisodes.findIndex(e => e.series === series
    && e.number === number
    && e.season === season)
    < 0);
}

function saveEpisodes() {
    fs.writeFileSync(path.join(__dirname, '../data/airedEpisodesToProvide.json'), JSON.stringify(episodes, null, 4), 'utf8');
    fs.writeFileSync(path.join(__dirname, '../data/providedEpisodes.json'), JSON.stringify(providedEpisodes, null, 4), 'utf8');
}

function saveSeries() {
    fs.writeFileSync(path.join(__dirname, '../data/series.json'), JSON.stringify(series, null, 4), 'utf8');
}