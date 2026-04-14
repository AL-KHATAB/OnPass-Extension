// Loads the background modules in dependency order so shared helpers exist
// before listeners start handling popup and content-script requests.
importScripts(
    '../shared/constants.js',
    '../shared/domain-utils.js',
    '../shared/api-client.js',
    'cache.js',
    'domain-match.js',
    'token.js',
    'passwords-api.js',
    'listeners.js'
);
