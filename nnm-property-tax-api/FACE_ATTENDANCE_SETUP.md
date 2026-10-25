# Face Attendance – server setup (APP server 192.168.186.129)

Face attendance uses **CompreFace** (free, open source, by Exadel) running in Docker on the APP server, reachable
only from the API on `127.0.0.1:8000`. Nothing goes to the internet; faces stay on the SDC.

Until the steps below are done, keep `FACE_ATTENDANCE_ENABLED=false` - the portal works exactly as before.

## 1. Check the server

```bash
nproc                       # 4 or more CPUs recommended
free -h                     # CompreFace needs about 3-4 GB RAM on top of the portal
df -h /                     # 20 GB free for images + CompreFace database
grep -c avx /proc/cpuinfo   # must be > 0 (CompreFace's CPU build needs AVX)
```

If RAM is short, ask SDC to add 4 GB to the APP VM.

## 2. Install Docker (if not present)

Ubuntu: `sudo apt-get install -y docker.io docker-compose-v2` (or Docker's own repository).
SDC must allow Docker on the VM.

## 3. Get CompreFace

On a machine **with internet**, download the release zip **CompreFace_1.2.0.zip** from
`https://github.com/exadel-inc/CompreFace/releases` and copy it to the APP server, for example
`/opt/compreface`. Unzip it there.

If the APP server cannot reach Docker Hub, pull the five images on a machine that can and transfer them:

```bash
# on the internet machine
for i in compreface-postgres-db compreface-admin compreface-api compreface-fe compreface-core; do docker pull exadel/$i:1.2.0; done
docker save -o compreface-1.2.0.tar $(for i in compreface-postgres-db compreface-admin compreface-api compreface-fe compreface-core; do echo exadel/$i:1.2.0; done)
# copy compreface-1.2.0.tar to the APP server, then:
sudo docker load -i compreface-1.2.0.tar
```

## 4. Configure and start

In `/opt/compreface/.env` set a strong `postgres_password` (any long random value - it is CompreFace's own database).

In `/opt/compreface/docker-compose.yml`, in the `compreface-fe` service, change the port line so CompreFace is
**not** exposed to the network:

```yaml
    ports:
      - "127.0.0.1:8000:80"
```

Then:

```bash
cd /opt/compreface
sudo docker compose up -d
sudo docker compose ps          # all five containers "Up"
```

The containers restart automatically after a reboot (`restart: always` in the compose file).

## 5. Create the Recognition service and API key

The CompreFace web UI is on the server's localhost only. From your PC open an SSH tunnel:

```bash
ssh -L 8000:127.0.0.1:8000 <user>@192.168.186.129
```

and browse to `http://localhost:8000`:

1. Sign up (the first account becomes the CompreFace owner - keep the password safe).
2. Create application **NNM Attendance**.
3. Add a service, type **Recognition**, name **Safai staff**.
4. Copy its **API key**.

## 6. Portal settings

In `nnm-property-tax-api/.env` on the server only:

```
FACE_ATTENDANCE_ENABLED=true
COMPREFACE_URL=http://127.0.0.1:8000
COMPREFACE_API_KEY=<the Recognition service API key>
```

The defaults for the rest are fine to start with:

| Setting | Default | Meaning |
|---|---|---|
| FACE_MATCH_THRESHOLD | 0.85 | similarity needed for the straight photo |
| FACE_MATCH_THRESHOLD_TURNED | 0.75 | similarity needed for the head-turned photo |
| FACE_FRONT_MAX_YAW | 15 | first photo must be within 15° of straight |
| FACE_TURN_MIN_YAW | 20 | head must turn at least 20° |
| FACE_YAW_SIGN | 0 | direction check (see step 7); 0 = only checks that the head turned |
| FACE_PHOTO_RETENTION_DAYS | 90 | punch photos deleted after this; scores and attendance stay |

Then `npm run migrate` (migration 148) and restart the API in PM2.

## 7. Check and calibrate (5 minutes)

Take two photos of one person with a phone's **rear camera**: `straight.jpg` (looking at the camera) and
`left.jpg` (head turned to **their** left). Copy them to the server and run:

```bash
cd nnm-property-tax-api
npm run face:check -- straight.jpg left.jpg
```

It prints the match and the yaw angle of each photo, and the `FACE_YAW_SIGN` value to set (1 or -1). Put that in
`.env` and restart the API - from then on, turning the wrong way is also refused.

If it says **No pose in the reply**, the head-pose plugin is missing from compreface-core: in `docker-compose.yml`,
under `compreface-core` → `environment`, add
`EXTRA_PLUGINS=facenet.LandmarksDetector,agegender.AgeDetector,agegender.GenderDetector,facenet.facemask.MaskDetector,facenet.PoseEstimator`
and run `sudo docker compose up -d` again.

## 8. The field app (WebView)

The camera opens only if the Android wrapper app grants camera access to the web page:

- `AndroidManifest.xml`: `<uses-permission android:name="android.permission.CAMERA" />`
- ask for the CAMERA runtime permission when the app starts;
- in the WebView setup:

```java
webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
webView.setWebChromeClient(new WebChromeClient() {
    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        request.grant(request.getResources());   // allow the portal's camera request
    }
});
```

The site must be opened over **https://mmc.bihar.gov.in** (browsers allow the camera only on HTTPS).

## Day-to-day

- **Enrol** (Dashboard → Face Attendance → Enrol faces): Sanitation Prabhari / APSWMO / Sanitation Officer /
  Attendance Admin. Explain the purpose to the worker, record consent, take the straight photo and the head-turn
  photo. A face already enrolled as another worker is refused.
- **Mark**: Jamadar from his usual screen (his ward); Prabhari / APSWMO from Face Attendance → Mark attendance
  (any ward). Workers not yet enrolled are marked as before.
- **Manual mark of an enrolled worker** (camera fault, injury, server down): allowed with a written reason, and
  listed under Review for the Sanitation Officer / APSWMO.
- **Failed face checks** are listed under Review with the photo, for spot checks.
- **Worker leaves**: Enrol faces → Remove (deletes the face data in CompreFace and the enrolment photo).
- Back up `/opt/compreface` data with the server backup, or simply re-enrol if it is ever lost.
