#!/bin/bash

docker build -t nickbabenko/gps-tracker:latest .
sudo docker push nickbabenko/gps-tracker:latest