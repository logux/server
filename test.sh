podman build -q -t ubuntu-test -f ./ubuntu.dockerfile . && \
podman run --rm \
  --cpus=2 \
  --memory=7g \
  --publish 9229:9229 \
  --publish 9339:9339 \
  localhost/ubuntu-test:latest \
  node --experimental-vm-modules node_modules/jest/bin/jest.js --ci --detectOpenHandles
