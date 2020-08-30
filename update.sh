#!/bin/bash

docker build -t nickbabenko/traccar-api:latest .
sudo docker push nickbabenko/traccar-api:latest