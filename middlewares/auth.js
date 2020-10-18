const config = require("../config");

/*Authentification*/
var basicAuth = require('basic-auth');

module.exports = (req, res, next) => {
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