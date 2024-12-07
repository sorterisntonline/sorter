# sorter
clojure, rust, and react based pair-wise staunchly democratic social media application  
by [`@thmorris`](https://github.com/thmorris)  
 
> this repo: `forter`  
> _frontend for sorter_  

## install
1. install prereqs
- clojure
- docker
- node / npm
- rust 
- (babashka) <sub>optional</sub>  
- (Calva VSCode Extension)  

2. clone `borter`, `forter`, and `rustsorter`
```sh
$ git clone git@github.com:sorterisntonline/forter.git
$ git clone git@github.com:sorterisntonline/borter.git
$ git clone git@github.com:sorterisntonline/rustsorter.git
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

5. visit `http://localhost:3000`  

that is all!

