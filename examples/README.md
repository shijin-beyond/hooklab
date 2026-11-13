# Examples

## local-receiver.mjs

A standalone webhook receiver that counts every request — the fastest way to see
duplicate delivery work. It has no dependencies and is not part of the app.

```sh
# terminal 1: the receiver (or: npm run example:receiver)
node examples/local-receiver.mjs

# terminal 2: HookLab
npm start
```

Then in the dashboard set the target URL to `http://127.0.0.1:4040/hook` and send
with Deliveries > 1. The receiver logs `#1`, `#2`, … and its JSON response shows
how many requests it has seen, so you can confirm the handler actually ran once
per attempt.

Equivalent without the UI:

```sh
curl -s localhost:4737/api/events -H 'content-type: application/json' \
  -d '{"payload": "{\"hello\":\"world\"}"}'
# → {"id":"<event-id>"}

curl -s localhost:4737/api/runs -H 'content-type: application/json' \
  -d '{"eventId":"<event-id>","targetUrl":"http://127.0.0.1:4040/hook","deliveries":3,"intervalMs":200,"timeoutMs":5000}'
# → {"id":"<run-id>"}; watch the receiver's log count to 3
```
