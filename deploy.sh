#!/bin/sh

USER="mill7079"
MACHINE="csel-kh4250-08.cselabs.umn.edu"
DIRECTORY=".www/Final/"

rsync -avr --delete dist/ "$USER"@"$MACHINE":"$DIRECTORY"
