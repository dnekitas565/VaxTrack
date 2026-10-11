# 8. CONCLUSION

## 8.1 Summary of Learning Outcomes

Through this project we applied the main ideas of a database course to one working application. We moved from an unnormalized vaccination card to a BCNF schema and saw how each step removes an anomaly. We used constraints for the rules that fit them and triggers for those that do not, such as a date of birth that cannot be in the future. We wrote functions, a procedure and packages in PL/SQL, and used explicit, parameterized, FOR-loop and REF cursors where row-by-row processing or a result set for the application was needed. We learned to design a transaction as a unit: savepoints, row locks and guarded updates keep a dose and its stock consistent, and an error is raised with a code that the application can translate. We learned that a row-level trigger must not read its own table, and why a trigger needs a row to be touched before it fires. We also learned to test a database systematically: a script that builds its own data, compares expected with actual output, and removes what it created found real defects that manual clicking had not.

## 8.2 Future Scope

- The vaccines beyond newborn tracking: Td for pregnant women, the DPT booster at 5–6 years, Td at 10 and 16 years, and vitamin A doses 3 to 9.
- Reminders to parents by SMS or WhatsApp, a multi-language interface, and digital vaccination certificates.
- A progressive web app or native mobile application, and deployment to a cloud database and web server with proper session cookies, a content security policy and a forced password change at first sign-in.
- Analytics across clinics: coverage by district, drop-out between doses, and forecasting of the stock each clinic needs.
- More than one login per family, so that both parents can have their own.
