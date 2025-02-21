# sorter
clojure, rust, and react based pair-wise staunchly democratic social media application  

[![prod](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml/badge.svg?branch=production)](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml)   


![sorter frontend screenshot](frontend_1.png)

> ### Contributors
> `@thmorriss`  
> [![wakatime](https://wakatime.com/badge/user/116b65a9-c932-4d5d-a682-331cd988d6f0/project/e7669bfe-a191-44f0-b3eb-02cdebe8c923.svg)](https://wakatime.com/badge/user/116b65a9-c932-4d5d-a682-331cd988d6f0/project/e7669bfe-a191-44f0-b3eb-02cdebe8c923)  
> `@zudsniper`  
> [![wakatime](https://wakatime.com/badge/user/72fdcd5a-a9d0-4016-b00f-3f3d6fb2514a/project/e1e0cfd8-9d79-4d5f-acdf-80064f6e2613.svg)](https://wakatime.com/badge/user/72fdcd5a-a9d0-4016-b00f-3f3d6fb2514a/project/e1e0cfd8-9d79-4d5f-acdf-80064f6e2613)  
> `@laralove143`  
> [![wakatime](https://wakatime.com/badge/user/63c0a54b-c8c3-4d1d-8880-80300b937662/project/161a1426-2ddd-400f-b45d-7206650e2858.svg)](https://wakatime.com/badge/user/63c0a54b-c8c3-4d1d-8880-80300b937662/project/161a1426-2ddd-400f-b45d-7206650e2858)

## install
1. install prereqs
- clojure
- docker
- node / npm
- rust 
- (babashka) <sub>optional</sub>  
- (Calva VSCode Extension)  

2. clone sorter (this repo)
```sh
$ git clone git@github.com:sorterisntonline/sorter.git
$ cd sorter
```

## build
1. (backend) run postgres database (with docker)  
```sh
$ cd borter/database # you need to be in this directory! don't execute the script from somewhere else
$ ./run-postgres.sh
```
2. (backend) run clojure backend  
```sh
$ cd borter/
$ ./run.sh
```
3. (rust) run rust backend  
```sh
$ cd rustsorter/
$ cargo run
```
4. (frontend) run node/frontend
```sh
$ cd forter/
$ npm install
$ npm run dev
```
5. (frontend/chat) run chat node/frontend
```sh
$ cd clisorter/
$ npm install
$ npm run dev
```

6. visit `http://localhost:3000`  

that is all!
