---
layout: post
title:  "Deploy nativ Kubernetes via Script"
date:   2018-04-03 12:10:29 +0100
categories: otc blueprint
excerpt_separator: <!--excerpt-->
---

The simplest way to deploy Kubernetes on OpenTelekomCloud is the usage of a script based template. All of the necessary information will be described in this blog post.

<!--excerpt-->

**First Subheading**

This is the blog post content.

**Second Subheading**

Also text for this heading.

Node         | Description
------------ | -----------
master-{0-2} | Master nodes running OpenShift and Kubernetes Master and ETCD. Internally available under `master-{0-2}.internal.oc.example.com` address
infra-node-{0-2} | Infrastructure nodes. Those would be running OpenShift routers, which will forward INGRESS requests to the proper node running application Pod. Internally available under `infra-node-{0-2}.internal.oc.example.com`
app-node-{0-2} | Worker nodes. This nodes will be running application Pods. Internally available under `app-node-{0-2}.internal.oc.example.com`
