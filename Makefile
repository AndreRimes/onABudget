stop:

	sudo docker rm -f onabudget || true

build:

	sudo docker build -t onabudget . 

run: 

	sudo docker run -d -p 3333:3000 --name onabudget onabudget

.PHONY: build run stop