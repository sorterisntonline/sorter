# sorter
rust and react based pair-wise staunchly democratic social media application

## project info

### contributors
- `@thmorriss`  
  [![wakatime](https://wakatime.com/badge/user/116b65a9-c932-4d5d-a682-331cd988d6f0/project/e7669bfe-a191-44f0-b3eb-02cdebe8c923.svg)](https://wakatime.com/badge/user/116b65a9-c932-4d5d-a682-331cd988d6f0/project/e7669bfe-a191-44f0-b3eb-02cdebe8c923)
- `@zudsniper`  
  [![wakatime](https://wakatime.com/badge/user/72fdcd5a-a9d0-4016-b00f-3f3d6fb2514a/project/e1e0cfd8-9d79-4d5f-acdf-80064f6e2613.svg)](https://wakatime.com/badge/user/72fdcd5a-a9d0-4016-b00f-3f3d6fb2514a/project/e1e0cfd8-9d79-4d5f-acdf-80064f6e2613)
- `@laralove143`  
  [![wakatime](https://wakatime.com/badge/user/63c0a54b-c8c3-4d1d-8880-80300b937662/project/161a1426-2ddd-400f-b45d-7206650e2858.svg)](https://wakatime.com/badge/user/63c0a54b-c8c3-4d1d-8880-80300b937662/project/161a1426-2ddd-400f-b45d-7206650e2858)

### deployments
- [![prod](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml/badge.svg?branch=production)](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml) (prod)
- [![staging](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml/badge.svg?branch=staging)](https://github.com/sorterisntonline/sorter/actions/workflows/deploy.yml) (staging)

# installation instructions

```bash
cargo install sqlx-cli

cd database && ./run-postgres.sh

# new terminal
cd rustsorter && sqlx migrate run --source ../migrations 

RUST_LOG=debug cargo run
```
