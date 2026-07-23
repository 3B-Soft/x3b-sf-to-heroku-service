# x3b-sf-to-heroku-service

Heroku proxy for large Salesforce ContentVersion files. See `CLAUDE.md` for the architecture map and `.docs/` for operational notes.

## Run

```sh
cp .env.example .env   # fill in values
npm install
npm run dev            # or: npm start
```

## Logs

```sh
heroku logs --tail -a x3b-sf-to-heroku
heroku logs --tail -a x3b-sf-to-heroku-uat

# router-level H27/H28 investigation:
heroku logs --source heroku --tail -a x3b-sf-to-heroku | grep 'H2[78]'
```
