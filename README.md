# setup
- node needs to be installed
- install dependencies via `npm install`
- insert own api key in L.6 of `main.js`
- run analysis with:
```
node main.js [repo-owner] [repo-name] [options]

Options:
-n    number of commits to consider when looking for dev pairs
-a    find files, which most commonly appear across all pull requests (-n is irrelevant here)
```
