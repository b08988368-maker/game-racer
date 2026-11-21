# Firestore Security Specification (`BLACKLIST: Rockport`)

## 1. Data Invariants
1. **User Profile Ownership**: A `users/{userId}` document can only be read, created, or updated by the verified authenticated user whose `request.auth.uid == userId`, with `uid` immutable and equal to `request.auth.uid`. Blanket `list` queries on `users` are forbidden.
2. **Garage Master Gate**: A `users/{userId}/garage/{carId}` document cannot be created or accessed unless its parent `/users/{userId}` document exists and belongs to `request.auth.uid`. `ownerId` and `carId` are immutable and must match path parameters.
3. **Public Rap Sheet Leaderboard Integrity**: A `leaderboard/{entryId}` document can only be created or updated by `request.auth.uid` when `entryId == request.auth.uid` and `data.uid == request.auth.uid`, preventing users from overwriting another player's Rap Sheet or spamming arbitrary entry IDs. Contains zero PII (only driver alias, car model, bounty, lap time, heat, and rank).
4. **Strict Keys & Types**: Every document enforces `keys().hasAll(...) && keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, numeric range bounds, regex ID validation, and `updatedAt == request.time`.

## 2. Dirty Dozen Attack Payloads (Expected: `PERMISSION_DENIED`)
1. **Shadow Field Injection on Profile**: Create `/users/{uid}` with extra field `isAdmin: true`.
2. **Identity Spoofing on Profile**: Create `/users/otherUid` while authenticated as `uid`.
3. **Unverified Email Write**: Attempt create/update with `request.auth.token.email_verified == false`.
4. **UID Mutation on Update**: Update `/users/{uid}` changing `uid` to `'attacker'`.
5. **Client Timestamp Forgery**: Create `/users/{uid}` with `updatedAt` set to a client-supplied past/future timestamp instead of `request.time`.
6. **Negative Cash / Bounty Poisoning**: Update `/users/{uid}` with `cash: -5000` or `totalBounty: -100`.
7. **Unbounded Array / Resource Exhaustion**: Update `/users/{uid}` with `ownedCarIds` containing 25 items (`> 20`) or `completedMissionIds` containing 65 items (`> 60`).
8. **Orphaned Garage Car**: Create `/users/{uid}/garage/cobalt_gt` before parent `/users/{uid}` exists.
9. **Path ID Poisoning**: Attempt `get` or `create` on `/users/{uid}/garage/bad$id..123` violating `^[a-zA-Z0-9_\-]+$`.
10. **Invalid Paint Hex / Livery Enum**: Update `/users/{uid}/garage/cobalt_gt` with `paintHex: 'red'` or `livery: 'hacked'`.
11. **Leaderboard Overwrite Spoofing**: Create/update `/leaderboard/otherUid` while signed in as `uid`.
12. **Blanket Users List Scrape**: Issue a `list` query against `/users`.
