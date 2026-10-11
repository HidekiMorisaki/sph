# Postal address lookup data sources

The application queries these services at request time. It does not bundle their databases or retain lookup results as a postal database. Users may save a selected address as part of an employee or branch record. The address form names and links the relevant providers.

| Country | Provider and terms | Use and required notice |
| --- | --- | --- |
| Japan | [zipcloud API](https://zipcloud.ibsnet.co.jp/doc/api), [API terms](https://zipcloud.ibsnet.co.jp/rule/api) | Query the live service for a postal code. Display zipcloud as the source. Do not create a stale postal lookup cache; review the terms when the integration or distribution changes. |
| United States | [Zippopotam.us](https://api.zippopotam.us/), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/) | Query the live service for a five-digit ZIP Code. Display Zippopotam.us and GeoNames as sources. Do not redistribute the provider database. |
| United States source data | [GeoNames postal code data](https://www.geonames.org/export/zip/), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Zippopotam.us documents GeoNames as its underlying data source. Credit GeoNames in the address form. |

Provider responses are suggestions, not address verification. The user chooses a candidate and can correct it. The application sends only the postal code and country to its own authenticated REST API; that API queries the selected provider. Recheck these terms before changing the service, caching results, bundling data, or releasing a new distribution model.
