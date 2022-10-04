BUILD_DATE := $(shell date +%y%m%d)
BUILD_TIME := $(shell date +%H%m%S)
BUILD_VERSION := $(shell grep version package.json | head -1 | cut -c 15- | rev | cut -c 3- | rev)
REVISION_INDEX := $(shell git --no-pager log --pretty=format:%h -n 1)
mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
current_dir := $(notdir $(patsubst %/,%,$(dir $(mkfile_path))))

KEYCHAIN_NAME := bai-build-$(shell uuidgen).keychain
BAI_APP_SIGN_KEYCHAIN_FILE := $(shell mktemp -d)/keychain.p12
BAI_APP_SIGN_KEYCHAIN =
test_web:
	npm run server:d
test_electron:
	./node_modules/electron/cli.js . --dev
run_tests:
	node ./node_modules/testcafe/bin/testcafe.js chrome tests
versiontag:
	echo '{ "package": "${BUILD_VERSION}", "build": "${BUILD_DATE}.${BUILD_TIME}", "revision": "${REVISION_INDEX}" }' > version.json
compile_keepversion:
	npm run build
compile: versiontag
# xeus-based kernel
#	python -m jupyter lite build --XeusPythonEnv.packages=numpy,matplotlib,ipyleaflet,scipy,pandas,scikit-learn,scikit-image,networkx --lite-dir=build
#	cp ./overrides.json ./build
	mkdir build
	cp ./jupyter-lite.json ./build
	python -m jupyter lite build --lite-dir build
#	python -m jupyter lite init --lite-dir build --contents ./quiz
all: dep mac win linux
dep:
	if [ ! -d "./build/_output/" ];then \
		make compile; \
	fi
	rm -rf build/electron-app
	mkdir -p build/electron-app
	cp -Rp ./build/_output ./build/electron-app/app
	cp ./package.json ./build/electron-app/package.json
	cp ./version.json ./build/electron-app/app/version.json
	cp ./main.js ./build/electron-app/main.js
	mkdir -p ./build/electron-app/node_modules/node-static
	mkdir -p ./build/electron-app/node_modules/colors
	mkdir -p ./build/electron-app/node_modules/mime
	mkdir -p ./build/electron-app/node_modules/minimist
	mkdir -p ./build/electron-app/node_modules/optimist
	mkdir -p ./build/electron-app/node_modules/wordwrap
	cp -Rp ./node_modules/node-static ./build/electron-app/node_modules
	cp -Rp ./node_modules/colors ./build/electron-app/node_modules
	cp -Rp ./node_modules/mime ./build/electron-app/node_modules
	cp -Rp ./node_modules/minimist ./build/electron-app/node_modules
	cp -Rp ./node_modules/optimist ./build/electron-app/node_modules
	cp -Rp ./node_modules/wordwrap ./build/electron-app/node_modules				
mac_load_keychain:
ifeq ($(BAI_APP_SIGN_KEYCHAIN),)
ifdef BAI_APP_SIGN_KEYCHAIN_B64
ifndef BAI_APP_SIGN_KEYCHAIN_PASSWORD
	$(error BAI_APP_SIGN_KEYCHAIN_PASSWORD is not defined)
endif  # BAI_APP_SIGN_KEYCHAIN_PASSWORD
	security create-keychain -p "" "${KEYCHAIN_NAME}"
	security set-keychain-settings -lut 21600 "${KEYCHAIN_NAME}"
	security unlock-keychain -p "" "${KEYCHAIN_NAME}"
	$(shell echo "${BAI_APP_SIGN_KEYCHAIN_B64}" | base64 -d -o "${BAI_APP_SIGN_KEYCHAIN_FILE}")
	security import "${BAI_APP_SIGN_KEYCHAIN_FILE}" -A -P "${BAI_APP_SIGN_KEYCHAIN_PASSWORD}" -k "${KEYCHAIN_NAME}"
	security list-keychain -d user -s login.keychain
	security list-keychain -d user -s "${KEYCHAIN_NAME}"
	security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "${KEYCHAIN_NAME}"
	$(eval BAI_APP_SIGN_KEYCHAIN := ${KEYCHAIN_NAME}) 
	echo Keychain ${KEYCHAIN_NAME} created for build
endif  # BAI_APP_SIGN_KEYCHAIN_B64
endif  # BAI_APP_SIGN_KEYCHAIN
mac: mac_intel mac_apple
mac_intel: dep mac_load_keychain
	BAI_APP_SIGN_KEYCHAIN="${BAI_APP_SIGN_KEYCHAIN}" node ./app-packager.js darwin x64
ifdef BAI_APP_SIGN_KEYCHAIN
	security default-keychain -s login.keychain
endif
	rm -rf ./app/SnakeBarrel-macos-intel
	cd app; mv "SnakeBarrel-darwin-x64" SnakeBarrel-macos-intel;
	./node_modules/electron-installer-dmg/bin/electron-installer-dmg.js './app/SnakeBarrel-macos-intel/SnakeBarrel.app' ./app/SnakeBarrel-intel-$(BUILD_DATE) --overwrite --icon=manifest/SB.icns --title=SnakeBarrel
	mv ./app/SnakeBarrel-intel-$(BUILD_DATE).dmg ./app/SnakeBarrel-$(BUILD_VERSION)-macos-intel.dmg
mac_apple: dep mac_load_keychain
	BAI_APP_SIGN_KEYCHAIN="${BAI_APP_SIGN_KEYCHAIN}" node ./app-packager.js darwin arm64
ifdef BAI_APP_SIGN_KEYCHAIN
	security default-keychain -s login.keychain
endif
	rm -rf ./app/SnakeBarrel-macos-apple
	cd app; mv "SnakeBarrel-darwin-arm64" SnakeBarrel-macos-apple;
	./node_modules/electron-installer-dmg/bin/electron-installer-dmg.js './app/SnakeBarrel-macos-apple/SnakeBarrel.app' ./app/SnakeBarrel-apple-$(BUILD_DATE) --overwrite --icon=manifest/SB.icns --title=SnakeBarrel
	mv ./app/SnakeBarrel-apple-$(BUILD_DATE).dmg ./app/SnakeBarrel-$(BUILD_VERSION)-macos-apple.dmg
win: dep
	node ./app-packager.js win x64
	cd app; zip ./SnakeBarrel-win32-x64-$(BUILD_DATE).zip -r "./SnakeBarrel-win32-x64"
	mv ./app/SnakeBarrel-win32-x64-$(BUILD_DATE).zip ./app/SnakeBarrel-$(BUILD_VERSION)-win32-x64.zip
linux: linux_intel linux_arm64
linux_arm64: dep
	node ./app-packager.js linux arm64
	cd app; zip -r -9 ./SnakeBarrel-linux-arm64-$(BUILD_DATE).zip "./SnakeBarrel-linux-arm64"
	mv ./app/SnakeBarrel-linux-arm64-$(BUILD_DATE).zip ./app/SnakeBarrel-$(BUILD_VERSION)-linux-arm64.zip
linux_intel: dep
	node ./app-packager.js linux x64
	cd app; zip -r -9 ./SnakeBarrel-linux-x64-$(BUILD_DATE).zip "./SnakeBarrel-linux-x64"
	mv ./app/SnakeBarrel-linux-x64-$(BUILD_DATE).zip ./app/SnakeBarrel-$(BUILD_VERSION)-linux-x64.zip
clean:
	cd app;	rm -rf ./snake*; rm -rf ./snake*
	cd build;rm -rf ./_output ./electron-app ./*
