# Techblog Open Telekom Cloud

The Techblog is used to publish interesting technical stuff around Open Telekom Cloud. Blueprints are a form of a template which can be used as easy way to get started with a specific topic. The normal "Posts"-area (Home) will deliver information about often ask questions by our customers or other more general technical topics.

The Techblog provides two main folders `_posts` and `_blueprints` where blogposts can be placed as markdown files (*.md).

## How to write a blueprint or a blog post

* Place your md file in the _blueprints folder if you write a Blueprint or in the `_posts` folder to write a "normal" blogpost and name it `YYYY-MM-DD-<<<YOUR_WONDERFUL_NAME>>>.md`
* Add a meta-information head ("Front Matters") at the top of the file with following information:
```
\---
layout: post
title:  "Openshift Origin on FedoraAtomic"
date:   2018-03-23 12:10:29 +0100
categories: otc blueprint
author: Your name
excerpt_separator: <!--excerpt-->
\---
```
* The `excerpt_separator` is optional and can be used to create a text hook which will be published on the front page where all of the blogposts or blueprints are listed to generate a user interest. Use `<!--excerpt-->` somewhere in your markdown file to create the text-cut. Default: The first paragraph `<p>...<p>` will be taken to generate the excerpt on the front page. It is recommended to use the excerpt_separator to ensure the functionality.

**Note:** If there are `{{` or `}}` or `{%` or `%}` present in the content, please **escape** them with `{{site.lcb}}` for "{" and `{{site.rcb}}` for "}" otherwise it will be interpreted as Liquid Template and the content of the blog post will be corrupted.
