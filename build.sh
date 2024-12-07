rm resources/public/assets/*.css
rm resources/public/assets/*.js
rm resources/public/new/assets/*.css
rm resources/public/new/assets/*.js
cd ../forter
npm run build
cd -
cd ../clisorter
npm run build
cd -
# cp -r ../forter/dist/* resources/public
clojure -X:build build-client          # optimized release build
clojure -X:build uberjar   
