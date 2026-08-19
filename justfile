set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    just --list

check:
    npm run check

test:
    npm test

build:
    npm run build

pack:
    npm run pack:check

ready:
    npm run check
    npm test
    npm run build
    npm run pack:check

release kind="patch":
    npm version {{kind}}
    git push --follow-tags
